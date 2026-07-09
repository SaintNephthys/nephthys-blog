/** 값 표시용 포맷 — 유효자리 유지하되 부동소수 노이즈 제거 */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  // sin(180°) = 1.2e-16 같은 영점 부동소수 노이즈는 0으로
  if (a < 1e-12) return '0'
  if (a >= 1e6 || a < 1e-4) return v.toExponential(3)
  return String(Number(v.toFixed(4)))
}
