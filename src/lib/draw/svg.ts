/**
 * DrawDoc ⇄ SVG 직렬화 — DOM 비의존 순수 문자열 처리.
 *
 * docToSvg가 만든 SVG에는 문서 JSON이 <metadata>로 임베드되어 svgToDoc으로
 * 왕복한다(재편집·MCP/Agent의 프로그램적 수정 경로). 게시물에는 <img>로
 * 로드되므로 CSS 변수를 쓸 수 없다 — 색은 팔레트 hex로 고정된다.
 */

import { DRAW_FONT, roleDef, isRoleKey, type RoleKey } from './palette'
import { docBBox } from './ops'
import { DRAW_DOC_VERSION, type DrawDoc, type Shape } from './types'

const METADATA_ID = 'nephthys-draw'
const RECT_RADIUS = 6
const LINE_HEIGHT = 1.4

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

function dashAttr(shape: Shape): string {
  if (!shape.dashed) return ''
  const sw = shape.strokeWidth
  return ` stroke-dasharray="${fmt(sw * 3)},${fmt(sw * 2)}"`
}

/** 중앙 정렬 라벨(사각형·타원 내부) — 다중 줄은 tspan으로 세로 중앙 배치 */
function centeredLabel(cx: number, cy: number, text: string, size: number, color: string): string {
  const lines = text.split('\n')
  const spans = lines
    .map((line, i) => {
      const dy = (i - (lines.length - 1) / 2) * size * LINE_HEIGHT
      return `<tspan x="${fmt(cx)}" y="${fmt(cy + dy)}">${escapeXml(line)}</tspan>`
    })
    .join('')
  return `<text font-family="${DRAW_FONT}" font-size="${fmt(size)}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${spans}</text>`
}

function renderShape(shape: Shape): string {
  const role = roleDef(shape.role)
  const strokeAttrs = `stroke="${role.stroke}" stroke-width="${fmt(shape.strokeWidth)}"${dashAttr(shape)}`
  switch (shape.kind) {
    case 'rect': {
      const body = `<rect x="${fmt(shape.x)}" y="${fmt(shape.y)}" width="${fmt(shape.w)}" height="${fmt(shape.h)}" rx="${RECT_RADIUS}" fill="${role.fill}" ${strokeAttrs}/>`
      return shape.text
        ? body + centeredLabel(shape.x + shape.w / 2, shape.y + shape.h / 2, shape.text, 16, role.label)
        : body
    }
    case 'ellipse': {
      const cx = shape.x + shape.w / 2
      const cy = shape.y + shape.h / 2
      const body = `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(shape.w / 2)}" ry="${fmt(shape.h / 2)}" fill="${role.fill}" ${strokeAttrs}/>`
      return shape.text ? body + centeredLabel(cx, cy, shape.text, 16, role.label) : body
    }
    case 'line': {
      const marker = shape.arrow ? ` marker-end="url(#arw-${shape.role})"` : ''
      return `<line x1="${fmt(shape.x1)}" y1="${fmt(shape.y1)}" x2="${fmt(shape.x2)}" y2="${fmt(shape.y2)}" ${strokeAttrs} fill="none"${marker}/>`
    }
    case 'text': {
      const spans = shape.text
        .split('\n')
        .map(
          (line, i) =>
            `<tspan x="${fmt(shape.x)}" y="${fmt(shape.y + i * shape.size * LINE_HEIGHT)}">${escapeXml(line)}</tspan>`,
        )
        .join('')
      return `<text font-family="${DRAW_FONT}" font-size="${fmt(shape.size)}" fill="${role.stroke}">${spans}</text>`
    }
  }
}

/** 문서에서 화살표가 쓰는 role별 marker 정의 — marker는 선 색을 상속하지 않으므로 role별 생성 */
function markerDefs(doc: DrawDoc): string {
  const roles = new Set<RoleKey>()
  for (const s of doc.shapes) if (s.kind === 'line' && s.arrow) roles.add(s.role)
  if (roles.size === 0) return ''
  const defs = [...roles]
    .map(
      (key) =>
        `<marker id="arw-${key}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><polygon points="0 0, 8 4, 0 8" fill="${roleDef(key).stroke}"/></marker>`,
    )
    .join('')
  return `<defs>${defs}</defs>`
}

export interface ToSvgOptions {
  /** true(기본)면 내용 bbox로 viewBox를 맞춘다. false면 캔버스 전체 */
  fit?: boolean
  pad?: number
}

/** 문서 → 독립 SVG 문자열 (배경 투명 — 게시물 페이지 배경 위에 얹힌다) */
export function docToSvg(doc: DrawDoc, options: ToSvgOptions = {}): string {
  const { fit = true, pad = 16 } = options
  const bbox = fit ? docBBox(doc) : null
  const vb = bbox
    ? { x: bbox.x - pad, y: bbox.y - pad, w: bbox.w + pad * 2, h: bbox.h + pad * 2 }
    : { x: 0, y: 0, w: doc.width, h: doc.height }
  const body = doc.shapes.map(renderShape).join('\n  ')
  const meta = escapeXml(JSON.stringify(doc))
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.w)} ${fmt(vb.h)}" width="${fmt(vb.w)}" height="${fmt(vb.h)}">`,
    `<metadata id="${METADATA_ID}">${meta}</metadata>`,
    markerDefs(doc),
    `  ${body}`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n')
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function validShape(s: unknown): s is Shape {
  if (typeof s !== 'object' || s === null) return false
  const o = s as Record<string, unknown>
  if (typeof o.id !== 'string' || !isRoleKey(o.role)) return false
  if (!isFiniteNum(o.strokeWidth) || typeof o.dashed !== 'boolean') return false
  switch (o.kind) {
    case 'rect':
    case 'ellipse':
      return (
        isFiniteNum(o.x) && isFiniteNum(o.y) && isFiniteNum(o.w) && isFiniteNum(o.h) &&
        (o.text === undefined || typeof o.text === 'string')
      )
    case 'line':
      return (
        isFiniteNum(o.x1) && isFiniteNum(o.y1) && isFiniteNum(o.x2) && isFiniteNum(o.y2) &&
        typeof o.arrow === 'boolean'
      )
    case 'text':
      return isFiniteNum(o.x) && isFiniteNum(o.y) && typeof o.text === 'string' && isFiniteNum(o.size)
    default:
      return false
  }
}

/**
 * SVG 문자열 → 문서 (docToSvg가 임베드한 metadata 기준).
 * 형식이 다르거나 검증에 실패하면 null — 조용한 오해석 대신 명시적 실패.
 */
export function svgToDoc(svgText: string): DrawDoc | null {
  const match = new RegExp(`<metadata id="${METADATA_ID}">([\\s\\S]*?)</metadata>`).exec(svgText)
  if (!match) return null
  try {
    const parsed: unknown = JSON.parse(unescapeXml(match[1]))
    if (typeof parsed !== 'object' || parsed === null) return null
    const doc = parsed as Record<string, unknown>
    if (doc.version !== DRAW_DOC_VERSION) return null
    if (!isFiniteNum(doc.width) || !isFiniteNum(doc.height)) return null
    if (!Array.isArray(doc.shapes) || !doc.shapes.every(validShape)) return null
    return {
      version: DRAW_DOC_VERSION,
      width: doc.width,
      height: doc.height,
      shapes: doc.shapes,
    }
  } catch {
    return null
  }
}
