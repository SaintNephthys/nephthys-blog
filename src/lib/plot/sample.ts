/**
 * 곡선 샘플링 — 명시적 곡선은 적응형(구 sampling.ts 이식), 매개변수 곡선은 균등.
 *
 * 적응형 규칙: 인접 샘플의 y 변화가 표시 범위(span)를 넘으면 구간을 재귀 세분한다.
 * 연속이지만 가파른 구간은 점이 촘촘해져 매끄럽게 이어지고, 발산 구간(점근선)은
 * 최대 깊이에서도 간극이 남아 NaN 마커로 확실히 끊는다. 판정이 격자 위치가 아니라
 * 발산 여부라서 슬라이더 드래그 중에도 프레임 간 결과가 일관된다(깜빡임 버그의
 * 해결책 — devnotes 참조). 유한한 거대값은 표시 범위 ±2배로 클램프해 분기 끝이
 * 안정적으로 화면 밖까지 이어진다.
 */

export const BASE_SAMPLES = 800
/** 적응형 세분 최대 깊이 — 문제 구간의 국소 밀도가 기본의 2^6배까지 올라간다 */
const MAX_REFINE_DEPTH = 6

export function sampleCurve(
  evalAt: (x: number) => number,
  x0: number,
  x1: number,
  yLo: number,
  yHi: number,
): Array<[number, number]> {
  const span = yHi - yLo
  const jumpLimit = span
  const clampLo = yLo - 2 * span
  const clampHi = yHi + 2 * span
  const points: Array<[number, number]> = []
  const push = (x: number, y: number) =>
    points.push([x, Number.isFinite(y) ? Math.min(clampHi, Math.max(clampLo, y)) : NaN])

  const segment = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    const aFinite = Number.isFinite(ya)
    const bFinite = Number.isFinite(yb)
    if (aFinite && bFinite && Math.abs(yb - ya) <= jumpLimit) {
      push(xb, yb)
      return
    }
    // 양끝 다 무효(정의역 밖 구간)면 세분해도 얻을 게 없다
    if (!aFinite && !bFinite) {
      push(xb, yb)
      return
    }
    // 양끝이 같은 쪽 클램프 밖이면 잇는 선분 전체가 화면 밖 — 세분 불필요.
    // 극점 주변의 가파른 offscreen 구간에서 gap이 수십 개 생기는 것을 막는다
    if (
      aFinite &&
      bFinite &&
      ((ya > clampHi && yb > clampHi) || (ya < clampLo && yb < clampLo))
    ) {
      push(xb, yb)
      return
    }
    if (depth >= MAX_REFINE_DEPTH) {
      points.push([(xa + xb) / 2, NaN])
      push(xb, yb)
      return
    }
    const xm = (xa + xb) / 2
    const ym = evalAt(xm)
    segment(xa, ya, xm, ym, depth + 1)
    segment(xm, ym, xb, yb, depth + 1)
  }

  let prevX = x0
  let prevY = evalAt(x0)
  push(prevX, prevY)
  for (let i = 1; i <= BASE_SAMPLES; i += 1) {
    const x = x0 + ((x1 - x0) * i) / BASE_SAMPLES
    const y = evalAt(x)
    segment(prevX, prevY, x, y, 0)
    prevX = x
    prevY = y
  }
  return points
}

export const PARAM_SAMPLES = 600

/** 매개변수 곡선 (x(s), y(s)) 균등 샘플링 — 비유한값은 NaN 마커(gap) */
export function sampleParametric(
  fx: (s: number) => number,
  fy: (s: number) => number,
  s0: number,
  s1: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let i = 0; i <= PARAM_SAMPLES; i += 1) {
    const s = s0 + ((s1 - s0) * i) / PARAM_SAMPLES
    const x = fx(s)
    const y = fy(s)
    if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y])
    else points.push([NaN, NaN])
  }
  return points
}
