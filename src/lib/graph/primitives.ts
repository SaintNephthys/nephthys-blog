/**
 * 스펙 파싱 공통 프리미티브 — 모든 kind 모듈이 공유한다.
 * 오류 메시지는 한국어로, 원인 키를 짚는다(문법 계약: devnotes §2.5).
 */

export const DEFAULT_DOMAIN: [number, number] = [-10, 10]
export const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/
/**
 * TOML bare 리터럴과 충돌하는 이름 — 식 안에서 따옴표 없이 쓰면
 * boolean/float으로 조용히 타입이 바뀌는 함정이 있어 이름 자체를 금지한다.
 */
export const TOML_LITERALS = new Set(['true', 'false', 'inf', 'nan'])

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function asNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Error(`${what}이(가) 숫자가 아닙니다`)
  return v
}

export function asInterval(v: unknown, what: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2)
    throw new Error(`${what}은(는) [최소, 최대] 형태의 배열이어야 합니다`)
  const min = asNumber(v[0], `${what} 최솟값`)
  const max = asNumber(v[1], `${what} 최댓값`)
  if (min >= max) throw new Error(`${what}의 최솟값이 최댓값보다 작아야 합니다`)
  return [min, max]
}

export function parseTitle(v: Record<string, unknown>, label: string): string | undefined {
  if (!('title' in v)) return undefined
  if (typeof v.title !== 'string') throw new Error(`${label}의 title은 문자열이어야 합니다`)
  return v.title
}

/**
 * 표시 항목 플래그 파싱 — `display.항목 = true/false` (TOML dotted key가
 * 중첩 테이블로 들어온다). **생략된 항목은 false**(명시한 것만 표시)가 기본.
 */
export function parseFlags(
  v: unknown,
  label: string,
  allowed: readonly string[],
  ctx = 'display',
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const key of allowed) out[key] = false
  if (v === undefined) return out
  if (!isRecord(v))
    throw new Error(`${label}의 ${ctx}은(는) '${ctx}.항목 = true/false' 형태여야 합니다`)
  for (const [key, val] of Object.entries(v)) {
    if (!allowed.includes(key))
      throw new Error(
        `${label}의 알 수 없는 ${ctx} 항목: '${key}' (${allowed.join('·')}만 지원)`,
      )
    if (typeof val !== 'boolean')
      throw new Error(`${label}의 ${ctx}.${key}은(는) true/false여야 합니다`)
    out[key] = val
  }
  return out
}
