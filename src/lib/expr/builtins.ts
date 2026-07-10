/** 내장 상수·함수 — 컴파일러와 이름 규칙 검증(scene)이 공유한다 */

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
}

function fact(n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.abs(n - Math.round(n)) > 1e-9) return NaN
  const k = Math.round(n)
  if (k > 170) return Infinity
  let r = 1
  for (let i = 2; i <= k; i += 1) r *= i
  return r
}

function nCr(n: number, r: number): number {
  if (
    !Number.isFinite(n) ||
    !Number.isFinite(r) ||
    Math.abs(n - Math.round(n)) > 1e-9 ||
    Math.abs(r - Math.round(r)) > 1e-9
  )
    return NaN
  const N = Math.round(n)
  let R = Math.round(r)
  if (R < 0 || R > N) return 0
  R = Math.min(R, N - R)
  let out = 1
  for (let i = 1; i <= R; i += 1) out = (out * (N - R + i)) / i
  return Math.round(out)
}

export const UNARY_FUNCS: Record<string, (a: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  fact,
}

export const BINARY_FUNCS: Record<string, (a: number, b: number) => number> = {
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  atan2: Math.atan2,
  nCr,
}

/** 이름이 식 문법의 예약어(상수·내장 함수·특수형)와 충돌하는지 */
export function isReservedWord(name: string): boolean {
  return (
    name in CONSTANTS ||
    name in UNARY_FUNCS ||
    name in BINARY_FUNCS ||
    name === 'if' ||
    name === 'sum' ||
    name === 'in'
  )
}
