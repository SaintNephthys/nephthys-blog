/** 수치 계산 — 합성 심프슨 적분(구 features/integral에서 이식) + 이분법 근 찾기 */

const SIMPSON_STEPS = 1000

/** 합성 심프슨 공식 — 구간 내 비유한값이 있으면 NaN으로 흘러나온다 */
export function integrate(evalAt: (x: number) => number, lo: number, hi: number): number {
  if (lo === hi) return 0
  const a = Math.min(lo, hi)
  const b = Math.max(lo, hi)
  const h = (b - a) / SIMPSON_STEPS
  let sum = evalAt(a) + evalAt(b)
  for (let i = 1; i < SIMPSON_STEPS; i += 1) {
    sum += evalAt(a + h * i) * (i % 2 === 1 ? 4 : 2)
  }
  const value = (sum * h) / 3
  return lo <= hi ? value : -value
}

const ROOT_SCAN = 240
const BISECT_ITERS = 60

/**
 * [lo, hi]에서 f의 근을 찾는다 — 균등 스캔으로 부호 변화 구간을 찾아 이분법.
 * 접점(부호 무변화)은 잡지 못한다 — 교점 마커 용도로는 충분한 한계.
 */
export function findRoots(f: (x: number) => number, lo: number, hi: number): number[] {
  const roots: number[] = []
  let prevX = lo
  let prevY = f(lo)
  for (let i = 1; i <= ROOT_SCAN; i += 1) {
    const x = lo + ((hi - lo) * i) / ROOT_SCAN
    const y = f(x)
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) roots.push(prevX)
      else if (prevY * y < 0) {
        let a = prevX
        let b = x
        let fa = prevY
        for (let k = 0; k < BISECT_ITERS; k += 1) {
          const m = (a + b) / 2
          const fm = f(m)
          if (!Number.isFinite(fm)) break
          if (fa * fm <= 0) b = m
          else {
            a = m
            fa = fm
          }
        }
        roots.push((a + b) / 2)
      }
    }
    prevX = x
    prevY = y
  }
  if (Number.isFinite(prevY) && prevY === 0) roots.push(prevX)
  // 스캔 경계에서 중복 검출된 근 정리
  const eps = (hi - lo) / ROOT_SCAN / 2
  return roots.filter((r, i) => i === 0 || r - roots[i - 1] > eps)
}
