/**
 * DrawDoc ⇄ SVG 직렬화 — DOM 비의존 순수 문자열 처리.
 *
 * docToSvg가 만든 SVG에는 문서 JSON이 <metadata>로 임베드되어 svgToDoc으로
 * 왕복한다(재편집·MCP/Agent의 프로그램적 수정 경로). 게시물에는 <img>로
 * 로드되므로 CSS 변수를 쓸 수 없다 — 색은 팔레트 hex로 고정된다.
 */

import { DRAW_FONT, DRAW_FONT_MONO, roleDef, isRoleKey, type RoleKey } from './palette'
import { docBBox } from './ops'
import { DRAW_DOC_VERSION, type DrawDoc, type Shape, type TextStyle } from './types'

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

/** 텍스트 스타일 → SVG 속성 문자열 (글꼴 포함 — 기본은 본문 글꼴) */
function textAttrs(style: TextStyle): string {
  const font = style.mono ? DRAW_FONT_MONO : DRAW_FONT
  return (
    `font-family="${font}"` +
    (style.bold ? ' font-weight="700"' : '') +
    (style.italic ? ' font-style="italic"' : '')
  )
}

/** 중앙 정렬 라벨(사각형·타원 내부) — 다중 줄은 tspan으로 세로 중앙 배치 */
function centeredLabel(
  cx: number,
  cy: number,
  text: string,
  size: number,
  color: string,
  style: TextStyle,
): string {
  const lines = text.split('\n')
  const spans = lines
    .map((line, i) => {
      const dy = (i - (lines.length - 1) / 2) * size * LINE_HEIGHT
      return `<tspan x="${fmt(cx)}" y="${fmt(cy + dy)}">${escapeXml(line)}</tspan>`
    })
    .join('')
  return `<text ${textAttrs(style)} font-size="${fmt(size)}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${spans}</text>`
}

function renderShape(shape: Shape): string {
  const role = roleDef(shape.role)
  const strokeAttrs = `stroke="${role.stroke}" stroke-width="${fmt(shape.strokeWidth)}"${dashAttr(shape)}`
  switch (shape.kind) {
    case 'rect': {
      const body = `<rect x="${fmt(shape.x)}" y="${fmt(shape.y)}" width="${fmt(shape.w)}" height="${fmt(shape.h)}" rx="${RECT_RADIUS}" fill="${role.fill}" ${strokeAttrs}/>`
      return shape.text
        ? body +
            centeredLabel(
              shape.x + shape.w / 2,
              shape.y + shape.h / 2,
              shape.text,
              shape.textSize ?? 16,
              role.label,
              shape,
            )
        : body
    }
    case 'ellipse': {
      const cx = shape.x + shape.w / 2
      const cy = shape.y + shape.h / 2
      const body = `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(shape.w / 2)}" ry="${fmt(shape.h / 2)}" fill="${role.fill}" ${strokeAttrs}/>`
      return shape.text
        ? body + centeredLabel(cx, cy, shape.text, shape.textSize ?? 16, role.label, shape)
        : body
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
      return `<text ${textAttrs(shape)} font-size="${fmt(shape.size)}" fill="${role.stroke}">${spans}</text>`
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

/** 도형 하나의 검증 오류 메시지 목록 (빈 배열 = 유효) */
function shapeErrors(s: unknown, i: number): string[] {
  const at = `shapes[${i}]`
  if (typeof s !== 'object' || s === null) return [`${at}: 객체가 아닙니다`]
  const o = s as Record<string, unknown>
  const errors: string[] = []
  if (typeof o.id !== 'string' || o.id === '') errors.push(`${at}.id: 비어 있지 않은 문자열 필요`)
  if (!isRoleKey(o.role)) errors.push(`${at}.role: 알 수 없는 팔레트 role '${String(o.role)}'`)
  if (!isFiniteNum(o.strokeWidth)) errors.push(`${at}.strokeWidth: 유한 숫자 필요`)
  if (typeof o.dashed !== 'boolean') errors.push(`${at}.dashed: boolean 필요`)
  const num = (key: string) => {
    if (!isFiniteNum(o[key])) errors.push(`${at}.${key}: 유한 숫자 필요`)
  }
  // 텍스트 스타일(선택) — bold/italic/mono boolean
  for (const k of ['bold', 'italic', 'mono']) {
    if (o[k] !== undefined && typeof o[k] !== 'boolean')
      errors.push(`${at}.${k}: boolean 또는 생략`)
  }
  switch (o.kind) {
    case 'rect':
    case 'ellipse':
      for (const k of ['x', 'y', 'w', 'h']) num(k)
      if (o.text !== undefined && typeof o.text !== 'string')
        errors.push(`${at}.text: 문자열 또는 생략`)
      if (o.textSize !== undefined && !isFiniteNum(o.textSize))
        errors.push(`${at}.textSize: 유한 숫자 또는 생략`)
      break
    case 'line':
      for (const k of ['x1', 'y1', 'x2', 'y2']) num(k)
      if (typeof o.arrow !== 'boolean') errors.push(`${at}.arrow: boolean 필요`)
      if (o.boundStart !== undefined && typeof o.boundStart !== 'string')
        errors.push(`${at}.boundStart: 도형 id 문자열 또는 생략`)
      if (o.boundEnd !== undefined && typeof o.boundEnd !== 'string')
        errors.push(`${at}.boundEnd: 도형 id 문자열 또는 생략`)
      break
    case 'text':
      for (const k of ['x', 'y', 'size']) num(k)
      if (typeof o.text !== 'string') errors.push(`${at}.text: 문자열 필요`)
      break
    default:
      errors.push(`${at}.kind: 알 수 없는 종류 '${String(o.kind)}' (rect|ellipse|line|text)`)
  }
  return errors
}

/**
 * JSON 값의 문서 검증 오류 목록 (빈 배열 = 유효). CLI·MCP가 에이전트에게
 * 행 단위로 짚어 주기 위한 시끄러운 검증 — 조용한 오해석 금지 원칙.
 */
export function docErrors(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['문서가 객체가 아닙니다']
  const doc = value as Record<string, unknown>
  const errors: string[] = []
  if (doc.version !== DRAW_DOC_VERSION)
    errors.push(`version: ${DRAW_DOC_VERSION} 필요 (받음: ${String(doc.version)})`)
  if (!isFiniteNum(doc.width)) errors.push('width: 유한 숫자 필요')
  if (!isFiniteNum(doc.height)) errors.push('height: 유한 숫자 필요')
  if (!Array.isArray(doc.shapes)) {
    errors.push('shapes: 배열 필요')
    return errors
  }
  const ids = new Set<string>()
  doc.shapes.forEach((s, i) => {
    errors.push(...shapeErrors(s, i))
    const id = (s as Record<string, unknown> | null)?.id
    if (typeof id === 'string') {
      if (ids.has(id)) errors.push(`shapes[${i}].id: 중복 id '${id}'`)
      ids.add(id)
    }
  })
  return errors
}

/** JSON 값 → 문서. 검증 실패 시 null (오류 내용은 docErrors로) */
export function docFromJson(value: unknown): DrawDoc | null {
  if (docErrors(value).length > 0) return null
  const doc = value as { width: number; height: number; shapes: Shape[] }
  return {
    version: DRAW_DOC_VERSION,
    width: doc.width,
    height: doc.height,
    shapes: doc.shapes,
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
    return docFromJson(JSON.parse(unescapeXml(match[1])))
  } catch {
    return null
  }
}
