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

/** 선택 도형을 배열 끝(맨 앞 표시)으로 — 상대 순서 유지 */
export function bringToFront(doc: DrawDoc, ids: ReadonlySet<string>): DrawDoc {
  const rest = doc.shapes.filter((s) => !ids.has(s.id))
  const picked = doc.shapes.filter((s) => ids.has(s.id))
  return { ...doc, shapes: [...rest, ...picked] }
}

/** 선택 도형을 배열 앞(맨 뒤 표시)으로 — 상대 순서 유지 */
export function sendToBack(doc: DrawDoc, ids: ReadonlySet<string>): DrawDoc {
  const rest = doc.shapes.filter((s) => !ids.has(s.id))
  const picked = doc.shapes.filter((s) => ids.has(s.id))
  return { ...doc, shapes: [...picked, ...rest] }
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** 선택 도형들을 선택 전체 bbox 기준으로 정렬 (2개 이상일 때 의미) */
export function alignShapes(doc: DrawDoc, ids: ReadonlySet<string>, mode: AlignMode): DrawDoc {
  const targets = doc.shapes.filter((s) => ids.has(s.id))
  if (targets.length < 2) return doc
  const boxes = targets.map((s) => ({ s, b: shapeBBox(s) }))
  const minX = Math.min(...boxes.map(({ b }) => b.x))
  const maxX = Math.max(...boxes.map(({ b }) => b.x + b.w))
  const minY = Math.min(...boxes.map(({ b }) => b.y))
  const maxY = Math.max(...boxes.map(({ b }) => b.y + b.h))
  const moved = new Map<string, Shape>()
  for (const { s, b } of boxes) {
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = minX - b.x
    else if (mode === 'right') dx = maxX - (b.x + b.w)
    else if (mode === 'hcenter') dx = (minX + maxX) / 2 - (b.x + b.w / 2)
    else if (mode === 'top') dy = minY - b.y
    else if (mode === 'bottom') dy = maxY - (b.y + b.h)
    else dy = (minY + maxY) / 2 - (b.y + b.h / 2)
    if (dx !== 0 || dy !== 0) moved.set(s.id, translateShape(s, dx, dy))
  }
  if (moved.size === 0) return doc
  return { ...doc, shapes: doc.shapes.map((s) => moved.get(s.id) ?? s) }
}

/** 선택 도형들의 중심을 축 방향 등간격으로 분배 (3개 이상일 때 의미) */
export function distributeShapes(doc: DrawDoc, ids: ReadonlySet<string>, axis: 'x' | 'y'): DrawDoc {
  const targets = doc.shapes.filter((s) => ids.has(s.id))
  if (targets.length < 3) return doc
  const items = targets
    .map((s) => {
      const b = shapeBBox(s)
      return { s, center: axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2 }
    })
    .sort((a, b) => a.center - b.center)
  const first = items[0].center
  const last = items[items.length - 1].center
  const step = (last - first) / (items.length - 1)
  const moved = new Map<string, Shape>()
  items.forEach(({ s, center }, i) => {
    const delta = first + step * i - center
    if (delta !== 0)
      moved.set(s.id, axis === 'x' ? translateShape(s, delta, 0) : translateShape(s, 0, delta))
  })
  if (moved.size === 0) return doc
  return { ...doc, shapes: doc.shapes.map((s) => moved.get(s.id) ?? s) }
}

/**
 * 선택 도형 복제 — 새 id 부여, 오프셋 이동. 선 바인딩은 대상도 함께 복제된
 * 경우에만 복제본으로 재연결하고, 아니면 원본 도형에 그대로 붙는다.
 */
export function duplicateShapes(
  doc: DrawDoc,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): { doc: DrawDoc; newIds: string[] } {
  const targets = doc.shapes.filter((s) => ids.has(s.id))
  if (targets.length === 0) return { doc, newIds: [] }
  let next = doc
  const idMap = new Map<string, string>()
  const clones: Shape[] = []
  for (const s of targets) {
    const id = newShapeId({ ...next, shapes: [...next.shapes, ...clones] })
    idMap.set(s.id, id)
    clones.push({ ...translateShape(s, dx, dy), id })
  }
  const remapped = clones.map((s) =>
    s.kind === 'line'
      ? {
          ...s,
          boundStart: s.boundStart ? (idMap.get(s.boundStart) ?? s.boundStart) : undefined,
          boundEnd: s.boundEnd ? (idMap.get(s.boundEnd) ?? s.boundEnd) : undefined,
        }
      : s,
  )
  next = { ...next, shapes: [...next.shapes, ...remapped] }
  return { doc: next, newIds: [...idMap.values()] }
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
