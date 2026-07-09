/**
 * [params] — 모든 plot이 공유하는 슬라이더 파라미터.
 * 선언 순서 = 표시 순서 (문법 계약 — TOML 명세는 테이블 순서를 보장하지 않지만,
 * param 이름은 식별자 규칙(숫자 시작 불가)이라 JS 객체의 문자열 키 삽입 순서
 * 보존에 안전하게 기댈 수 있다. 이 전제를 깨는 변경(숫자형 이름 허용 등) 금지).
 */

import { isReservedWord } from '../mathExpr'
import { asNumber, isRecord, NAME_RE, TOML_LITERALS } from './primitives'

export interface GraphParam {
  name: string
  def: number
  min: number
  max: number
  step: number
}

const PARAM_FIELDS = new Set(['default', 'min', 'max', 'step'])

export function parseParam(name: string, v: unknown): GraphParam {
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
