/**
 * DrawDoc 순수 연산 — UI(DrawComposer)와 차후 MCP/Agent가 공유하는 조작 계층.
 * 모든 함수는 입력을 변경하지 않고 새 값을 반환한다(undo 스택·React 상태 호환).
 */

import type { DrawDoc, Shape } from './types'

let seq = 0

/** 문서 내 유일 id — 시각/난수 비의존(재현 가능한 테스트를 위해 카운터 기반) */
export function newShapeId(doc: DrawDoc): string {
  const used = new Set(doc.shapes.map((s) => s.id))
  let id: string
  do {
    seq += 1
    id = `s${seq}`
  } while (used.has(id))
  return id
}

export function addShape(doc: DrawDoc, shape: Shape): DrawDoc {
  return { ...doc, shapes: [...doc.shapes, shape] }
}

export function updateShape(doc: DrawDoc, id: string, patch: Partial<Shape>): DrawDoc {
  return {
    ...doc,
    shapes: doc.shapes.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s)),
  }
}

export function removeShape(doc: DrawDoc, id: string): DrawDoc {
  return { ...doc, shapes: doc.shapes.filter((s) => s.id !== id) }
}

export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.kind === 'line')
    return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
  return { ...shape, x: shape.x + dx, y: shape.y + dy }
}

/** 음수 폭/높이의 bbox를 정규화 — 드래그 방향 무관 */
export function normalizeBox(x: number, y: number, w: number, h: number) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h),
  }
}

/** 도형의 축 정렬 bbox (선·텍스트 포함, strokeWidth 미포함) */
export function shapeBBox(shape: Shape): { x: number; y: number; w: number; h: number } {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
    case 'line': {
      const x = Math.min(shape.x1, shape.x2)
      const y = Math.min(shape.y1, shape.y2)
      return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) }
    }
    case 'text': {
      // 텍스트 메트릭 근사(내보내기 fit용) — 한글 폭 ≈ size, 라틴 ≈ 0.6×size
      const lines = shape.text.split('\n')
      const width = Math.max(
        1,
        ...lines.map((line) =>
          [...line].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x2000 ? 1 : 0.6), 0),
        ),
      )
      return {
        x: shape.x,
        y: shape.y - shape.size,
        w: width * shape.size,
        h: lines.length * shape.size * 1.4,
      }
    }
  }
}

/** 전체 도형의 합성 bbox — 도형이 없으면 null */
export function docBBox(doc: DrawDoc): { x: number; y: number; w: number; h: number } | null {
  if (doc.shapes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const shape of doc.shapes) {
    const b = shapeBBox(shape)
    const pad = shape.strokeWidth / 2
    minX = Math.min(minX, b.x - pad)
    minY = Math.min(minY, b.y - pad)
    maxX = Math.max(maxX, b.x + b.w + pad)
    maxY = Math.max(maxY, b.y + b.h + pad)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
