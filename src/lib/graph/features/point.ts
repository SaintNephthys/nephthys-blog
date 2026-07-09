/**
 * point 기능 — `point = "<param 식>"`: 추적점의 x 위치.
 * display.graph.point가 곡선 위 링 마커를 켜고, 비호버 시 x·fx readout이
 * 이 점의 값을 추적한다(호버 우선).
 */

import { compileExpression, type EvalFn } from '../../mathExpr'

export interface TrackedPoint {
  pointSource: string
  point: EvalFn
}

export function parsePoint(v: unknown, label: string, paramNames: string[]): TrackedPoint {
  if (typeof v !== 'string' || !v.trim())
    throw new Error(`${label}의 point는 식을 담은 문자열이어야 합니다 (따옴표로 감쌀 것)`)
  const pointSource = v.trim()
  try {
    return { pointSource, point: compileExpression(pointSource, paramNames) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`${label} point: ${msg}`, { cause: e })
  }
}
