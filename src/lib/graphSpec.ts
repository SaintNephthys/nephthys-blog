/**
 * ```graph 코드 펜스의 스펙 파서 — TOML (2026-07-09 전량 이관, 구 줄 단위 문법 폐기).
 *
 * 문법 (TOML 1.0 고정, smol-toml):
 *   fn = "a * sin(b * x)"                  ← 필수. 식은 항상 문자열로 감싼다
 *   domain = [-10, 10]                     ← 선택. x 정의역 (기본 [-10, 10])
 *   range = [-2, 2]                        ← 선택. y 표시 범위 (생략 시 자동;
 *                                             점근선이 있는 함수는 지정을 권장)
 *   integral = [0, "t"]                    ← 선택. 적분 구간 음영 + 수치 적분값.
 *                                             경계는 숫자 또는 문자열(param 식, x 불가)
 *   [params]                               ← 선택. 슬라이더 파라미터
 *   a = { default = 1, min = 0, max = 5, step = 0.1 }   ← step 생략 시 (max-min)/100
 *
 * 슬라이더 표시 순서 = [params] 선언 순서. TOML 명세는 테이블 키 순서를 보장하지
 * 않지만, param 이름은 식별자 규칙(숫자로 시작 불가)이라 JS 객체의 문자열 키
 * 삽입 순서 보존에 안전하게 기댈 수 있다.
 *
 * 구 문법(`fn: …`)은 TOML 구문 오류로 시끄럽게 거부된다 — 조용한 오해석 없음.
 * 게시물 md에 영속되는 스키마이므로 확장은 항상 하위 호환으로만 한다
 * (새 키 추가는 가능, 기존 키의 의미 변경은 불가).
 */

import { parse as parseToml } from 'smol-toml'
import { compileExpression, isReservedWord, type EvalFn } from './mathExpr'

export interface GraphParam {
  name: string
  def: number
  min: number
  max: number
  step: number
}

export interface GraphIntegral {
  fromSource: string
  toSource: string
  /** 경계식 — param 값만으로 평가된다 (x 불가) */
  from: EvalFn
  to: EvalFn
}

export interface GraphSpec {
  fnSource: string
  fn: EvalFn
  domain: [number, number]
  range?: [number, number]
  params: GraphParam[]
  integral?: GraphIntegral
}

const DEFAULT_DOMAIN: [number, number] = [-10, 10]
const TOP_KEYS = new Set(['fn', 'domain', 'range', 'integral', 'params'])
const PARAM_FIELDS = new Set(['default', 'min', 'max', 'step'])
/**
 * TOML bare 리터럴과 충돌하는 param 이름 — 식 안에서 따옴표 없이 쓰면
 * boolean/float으로 조용히 타입이 바뀌는 함정이 있어 이름 자체를 금지한다.
 */
const TOML_LITERALS = new Set(['true', 'false', 'inf', 'nan'])
const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Error(`${what}이(가) 숫자가 아닙니다`)
  return v
}

function asInterval(v: unknown, what: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2)
    throw new Error(`${what}은(는) [최소, 최대] 형태의 배열이어야 합니다`)
  const min = asNumber(v[0], `${what} 최솟값`)
  const max = asNumber(v[1], `${what} 최댓값`)
  if (min >= max) throw new Error(`${what}의 최솟값이 최댓값보다 작아야 합니다`)
  return [min, max]
}

function parseParam(name: string, v: unknown): GraphParam {
  if (!NAME_RE.test(name))
    throw new Error(`param 이름 '${name}'은(는) 영문자·_로 시작하는 식별자여야 합니다`)
  if (name === 'x') throw new Error(`param 이름으로 'x'는 쓸 수 없습니다 (독립변수)`)
  if (isReservedWord(name))
    throw new Error(`param 이름 '${name}'은(는) 상수·함수명과 충돌합니다`)
  if (TOML_LITERALS.has(name))
    throw new Error(`param 이름 '${name}'은(는) TOML 리터럴(true/false/inf/nan)과 충돌합니다`)
  if (!isRecord(v))
    throw new Error(`param ${name}은(는) { default = …, min = …, max = … } 테이블이어야 합니다`)
  for (const key of Object.keys(v)) {
    if (!PARAM_FIELDS.has(key))
      throw new Error(`param ${name}의 알 수 없는 필드: '${key}' (default·min·max·step만 지원)`)
  }
  for (const required of ['default', 'min', 'max']) {
    if (!(required in v)) throw new Error(`param ${name}에 '${required}' 필드가 필요합니다`)
  }
  const min = asNumber(v.min, `param ${name}의 min`)
  const max = asNumber(v.max, `param ${name}의 max`)
  if (min >= max) throw new Error(`param ${name}: min이 max보다 작아야 합니다`)
  const step = 'step' in v ? asNumber(v.step, `param ${name}의 step`) : (max - min) / 100
  if (step <= 0) throw new Error(`param ${name}: step은 0보다 커야 합니다`)
  const def = Math.min(max, Math.max(min, asNumber(v.default, `param ${name}의 default`)))
  return { name, def, min, max, step }
}

/** 적분 경계 — 숫자는 상수로, 문자열은 param 식으로 컴파일 */
function compileBound(
  v: unknown,
  which: string,
  paramNames: string[],
): { source: string; fn: EvalFn } {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return { source: String(v), fn: () => v }
  }
  if (typeof v === 'string') {
    try {
      return { source: v.trim(), fn: compileExpression(v, paramNames) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`integral ${which}: ${msg}`, { cause: e })
    }
  }
  throw new Error(`integral ${which}은(는) 숫자 또는 문자열(param 식)이어야 합니다`)
}

export function parseGraphSpec(text: string): GraphSpec {
  let data: unknown
  try {
    data = parseToml(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`TOML 구문 오류 — ${msg}`, { cause: e })
  }
  if (!isRecord(data)) throw new Error('스펙이 TOML 테이블이 아닙니다')

  for (const key of Object.keys(data)) {
    if (!TOP_KEYS.has(key))
      throw new Error(`알 수 없는 키: '${key}' (fn·domain·range·integral·params만 지원)`)
  }

  if (!('fn' in data)) throw new Error(`'fn = "<식>"' 항목이 필요합니다`)
  if (typeof data.fn !== 'string' || !data.fn.trim())
    throw new Error('fn은 식을 담은 문자열이어야 합니다 (따옴표로 감쌀 것)')
  const fnSource = data.fn.trim()

  const domain = 'domain' in data ? asInterval(data.domain, 'domain') : DEFAULT_DOMAIN
  const range = 'range' in data ? asInterval(data.range, 'range') : undefined

  const params: GraphParam[] = []
  if ('params' in data) {
    if (!isRecord(data.params))
      throw new Error('params는 테이블이어야 합니다 ([params] 섹션)')
    // 선언 순서 = 슬라이더 표시 순서 (파일 헤더 주석 참조)
    for (const [name, v] of Object.entries(data.params)) params.push(parseParam(name, v))
  }
  const paramNames = params.map((p) => p.name)

  const fn = compileExpression(fnSource, ['x', ...paramNames])

  let integral: GraphIntegral | undefined
  if ('integral' in data) {
    if (!Array.isArray(data.integral) || data.integral.length !== 2)
      throw new Error(`integral은 [시작, 끝] 형태의 배열이어야 합니다 (예: [0, "t"])`)
    const from = compileBound(data.integral[0], '시작값', paramNames)
    const to = compileBound(data.integral[1], '끝값', paramNames)
    integral = { fromSource: from.source, toSource: to.source, from: from.fn, to: to.fn }
  }

  return { fnSource, fn, domain, range, params, integral }
}
