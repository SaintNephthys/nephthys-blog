/**
 * ```graph 코드 펜스의 스펙 텍스트 파서.
 *
 * 문법 (줄 단위, `키: 값`):
 *   fn: a * sin(b * x)              — 필수. x와 param 변수로 이뤄진 식
 *   domain: [-10, 10]               — 선택. x 정의역 (기본 [-10, 10])
 *   range: [-2, 2]                  — 선택. y 표시 범위 (생략 시 자동 계산;
 *                                     점근선이 있는 함수는 지정을 권장)
 *   param: a = 1 [0, 5, 0.1]        — 0개 이상. 이름 = 기본값 [최소, 최대, 스텝]
 *                                     (스텝 생략 시 (최대-최소)/100)
 *   integral: [0, t]                — 선택. 적분 구간 — 곡선과 y=0 사이 영역을
 *                                     음영으로 칠하고 수치 적분값을 표시한다.
 *                                     경계는 숫자 또는 param으로 이뤄진 식
 *                                     (x는 쓸 수 없음)
 *
 * 게시물 md에 영속되는 문법이므로 확장은 항상 하위 호환으로만 한다
 * (새 키 추가는 가능, 기존 키의 의미 변경은 불가).
 */

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

function parseNumber(raw: string, what: string): number {
  const n = Number(raw.trim())
  if (raw.trim() === '' || !Number.isFinite(n))
    throw new Error(`${what}이(가) 숫자가 아닙니다: '${raw.trim()}'`)
  return n
}

/** `[a, b]` 또는 `a, b` 형태의 구간을 파싱 */
function parseInterval(raw: string, what: string): [number, number] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  const parts = inner.split(',')
  if (parts.length !== 2)
    throw new Error(`${what}은(는) '[최소, 최대]' 형태여야 합니다: '${raw.trim()}'`)
  const min = parseNumber(parts[0], `${what} 최솟값`)
  const max = parseNumber(parts[1], `${what} 최댓값`)
  if (min >= max) throw new Error(`${what}의 최솟값이 최댓값보다 작아야 합니다`)
  return [min, max]
}

const PARAM_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^[\]]+)\[([^\]]*)\]\s*$/

function parseParam(raw: string): GraphParam {
  const m = PARAM_RE.exec(raw.trim())
  if (!m)
    throw new Error(
      `param은 '이름 = 기본값 [최소, 최대, 스텝]' 형태여야 합니다: '${raw.trim()}'`,
    )
  const name = m[1]
  if (name === 'x') throw new Error(`param 이름으로 'x'는 쓸 수 없습니다 (독립변수)`)
  if (isReservedWord(name))
    throw new Error(`param 이름 '${name}'은(는) 상수·함수명과 충돌합니다`)

  const def = parseNumber(m[2], `param ${name}의 기본값`)
  const parts = m[3].split(',')
  if (parts.length !== 2 && parts.length !== 3)
    throw new Error(`param ${name}의 범위는 [최소, 최대] 또는 [최소, 최대, 스텝]이어야 합니다`)
  const min = parseNumber(parts[0], `param ${name}의 최솟값`)
  const max = parseNumber(parts[1], `param ${name}의 최댓값`)
  if (min >= max) throw new Error(`param ${name}: 최솟값이 최댓값보다 작아야 합니다`)
  const step = parts.length === 3 ? parseNumber(parts[2], `param ${name}의 스텝`) : (max - min) / 100
  if (step <= 0) throw new Error(`param ${name}: 스텝은 0보다 커야 합니다`)

  return { name, def: Math.min(max, Math.max(min, def)), min, max, step }
}

export function parseGraphSpec(text: string): GraphSpec {
  let fnSource: string | undefined
  let domain: [number, number] | undefined
  let range: [number, number] | undefined
  let integralRaw: [string, string] | undefined
  const params: GraphParam[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) throw new Error(`'키: 값' 형태가 아닌 줄이 있습니다: '${line}'`)
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()

    switch (key) {
      case 'fn':
        if (fnSource !== undefined) throw new Error('fn은 한 번만 지정할 수 있습니다')
        fnSource = value
        break
      case 'domain':
        domain = parseInterval(value, 'domain')
        break
      case 'range':
        range = parseInterval(value, 'range')
        break
      case 'param': {
        const p = parseParam(value)
        if (params.some((q) => q.name === p.name))
          throw new Error(`param '${p.name}'이(가) 중복 선언되었습니다`)
        params.push(p)
        break
      }
      case 'integral': {
        if (integralRaw) throw new Error('integral은 한 번만 지정할 수 있습니다')
        const inner = value.replace(/^\[/, '').replace(/\]$/, '')
        const parts = inner.split(',')
        if (parts.length !== 2)
          throw new Error(`integral은 '[시작, 끝]' 형태여야 합니다: '${value}'`)
        integralRaw = [parts[0].trim(), parts[1].trim()]
        break
      }
      default:
        throw new Error(`알 수 없는 키: '${key}' (fn·domain·range·param만 지원)`)
    }
  }

  if (!fnSource) throw new Error(`'fn: <식>' 줄이 필요합니다`)
  const fn = compileExpression(fnSource, ['x', ...params.map((p) => p.name)])

  // 적분 경계는 param만으로 평가 — param 선언이 integral 줄보다 뒤에 와도 되도록
  // 파일 전체를 읽은 뒤 컴파일한다 (fn과 동일)
  let integral: GraphIntegral | undefined
  if (integralRaw) {
    const paramNames = params.map((p) => p.name)
    const compileBound = (src: string, which: string): EvalFn => {
      try {
        return compileExpression(src, paramNames)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`integral ${which}: ${msg}`, { cause: e })
      }
    }
    integral = {
      fromSource: integralRaw[0],
      toSource: integralRaw[1],
      from: compileBound(integralRaw[0], '시작값'),
      to: compileBound(integralRaw[1], '끝값'),
    }
  }

  return { fnSource, fn, domain: domain ?? DEFAULT_DOMAIN, range, params, integral }
}
