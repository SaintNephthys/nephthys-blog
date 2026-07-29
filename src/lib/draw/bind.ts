/**
 * 화살표-도형 바인딩 — 선/화살표 끝점을 사각형·타원에 붙이면 도형 이동·리사이즈를
 * 따라간다. 순수 기하 연산만 있으며(DOM 비의존), 바인딩된 끝점의 저장 좌표는
 * 항상 해석된 값이라는 불변식(types.ts 참조)을 reflowBindings가 유지한다.
 */

import type { DrawDoc, LineShape, Shape } from './types'

/** 경계에서 화살촉이 겹치지 않도록 띄우는 간격 (논리 px) */
const GAP = 4

type BoxShape = Shape & { kind: 'rect' | 'ellipse' }

function isBindable(shape: Shape): shape is BoxShape {
  return shape.kind === 'rect' || shape.kind === 'ellipse'
}

/** 점이 도형 내부인가 (바인딩 대상 판정) */
export function containsPoint(shape: Shape, x: number, y: number): boolean {
  if (!isBindable(shape)) return false
  if (shape.kind === 'rect')
    return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h
  const rx = shape.w / 2
  const ry = shape.h / 2
  if (rx === 0 || ry === 0) return false
  const nx = (x - (shape.x + rx)) / rx
  const ny = (y - (shape.y + ry)) / ry
  return nx * nx + ny * ny <= 1
}

/** 점 위의 최상단 바인딩 가능 도형 id (그리기 순서상 앞의 것 우선) */
export function findBindTarget(doc: DrawDoc, x: number, y: number, excludeId?: string): string | null {
  for (let i = doc.shapes.length - 1; i >= 0; i -= 1) {
    const s = doc.shapes[i]
    if (s.id !== excludeId && containsPoint(s, x, y)) return s.id
  }
  return null
}

/** 도형 중심에서 (fromX, fromY) 방향의 경계점 + GAP — 화살표가 닿을 지점 */
function boundaryPoint(shape: BoxShape, fromX: number, fromY: number): { x: number; y: number } {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const dx = fromX - cx
  const dy = fromY - cy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: cx, y: cy }
  let t: number
  if (shape.kind === 'ellipse') {
    const rx = shape.w / 2 || 1e-6
    const ry = shape.h / 2 || 1e-6
    t = 1 / Math.hypot(dx / rx, dy / ry)
  } else {
    const tx = dx === 0 ? Infinity : Math.abs(shape.w / 2 / dx)
    const ty = dy === 0 ? Infinity : Math.abs(shape.h / 2 / dy)
    t = Math.min(tx, ty)
  }
  const scale = t + GAP / len
  return { x: cx + dx * scale, y: cy + dy * scale }
}

function shapeCenter(shape: BoxShape): { x: number; y: number } {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
}

/**
 * 바인딩된 선 끝점 좌표를 대상 도형의 현 위치 기준으로 재계산한다.
 * 대상이 사라졌거나 바인딩 불가 종류면 바인딩을 해제한다(좌표는 유지).
 * 변경이 없으면 입력 문서를 그대로 반환한다.
 */
export function reflowBindings(doc: DrawDoc): DrawDoc {
  const byId = new Map(doc.shapes.map((s) => [s.id, s]))
  let changed = false
  const shapes = doc.shapes.map((shape) => {
    if (shape.kind !== 'line' || (!shape.boundStart && !shape.boundEnd)) return shape
    const start = shape.boundStart ? byId.get(shape.boundStart) : undefined
    const end = shape.boundEnd ? byId.get(shape.boundEnd) : undefined
    const startOk = start !== undefined && isBindable(start)
    const endOk = end !== undefined && isBindable(end)

    // 방향 기준점: 반대편이 바인딩이면 그 도형 중심, 아니면 반대편 원좌표
    const startRef = endOk ? shapeCenter(end) : { x: shape.x2, y: shape.y2 }
    const endRef = startOk ? shapeCenter(start) : { x: shape.x1, y: shape.y1 }
    const p1 = startOk ? boundaryPoint(start, startRef.x, startRef.y) : { x: shape.x1, y: shape.y1 }
    const p2 = endOk ? boundaryPoint(end, endRef.x, endRef.y) : { x: shape.x2, y: shape.y2 }

    const next: LineShape = {
      ...shape,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      boundStart: startOk ? shape.boundStart : undefined,
      boundEnd: endOk ? shape.boundEnd : undefined,
    }
    if (
      next.x1 !== shape.x1 || next.y1 !== shape.y1 ||
      next.x2 !== shape.x2 || next.y2 !== shape.y2 ||
      next.boundStart !== shape.boundStart || next.boundEnd !== shape.boundEnd
    ) {
      changed = true
      return next
    }
    return shape
  })
  return changed ? { ...doc, shapes } : doc
}
