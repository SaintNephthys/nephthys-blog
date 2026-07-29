/**
 * 도형 이미지 문서 모델 — DrawComposer(에디터 모달)의 단일 원천.
 *
 * 설계 원칙 (차후 MCP/Agent 연동 전제):
 * - 문서는 순수 JSON(DrawDoc)이고 이 디렉터리(lib/draw)는 DOM/React 비의존.
 *   에이전트가 DrawDoc을 생성·수정해 docToSvg로 저장하는 경로가 UI와 동일하다.
 * - 내보낸 SVG에 문서 JSON을 <metadata>로 임베드해 svgToDoc으로 왕복 가능
 *   (재편집·프로그램적 수정의 기반).
 * - version 필드로 스키마를 식별한다. 확장은 필드 추가(widening)만 — 기존
 *   필드의 의미 변경·삭제 금지. 알 수 없는 kind/role은 무시가 아니라 거부.
 */

import type { RoleKey } from './palette'

export const DRAW_DOC_VERSION = 1

/** 도형 공통 — 색은 직접 지정하지 않고 팔레트 role로 참조한다(테마 일관성) */
interface ShapeBase {
  id: string
  role: RoleKey
  strokeWidth: number
  dashed: boolean
}

/** 사각형(모서리 둥긂) — text는 중앙 라벨 */
export interface RectShape extends ShapeBase {
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  text?: string
}

/** 타원 — bbox(x, y, w, h) 기준. text는 중앙 라벨 */
export interface EllipseShape extends ShapeBase {
  kind: 'ellipse'
  x: number
  y: number
  w: number
  h: number
  text?: string
}

/** 선 / 화살표(끝점 화살촉) */
export interface LineShape extends ShapeBase {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  arrow: boolean
  /**
   * 끝점 바인딩(v1 widening) — 사각형/타원 도형 id 참조. 바인딩된 끝점의
   * x/y에는 항상 **해석된(resolved) 좌표**가 저장된다(reflowBindings가 유지) —
   * 내보내기·bbox가 문서 맥락 없이 성립하기 위한 불변식. 대상 소실 시 바인딩만
   * 해제되고 좌표는 남는다.
   */
  boundStart?: string
  boundEnd?: string
}

/** 텍스트 — (x, y)는 첫 줄 베이스라인 좌측 기준 */
export interface TextShape extends ShapeBase {
  kind: 'text'
  x: number
  y: number
  text: string
  /** 논리 px — 내보내기에도 그대로 쓴다 */
  size: number
}

export type Shape = RectShape | EllipseShape | LineShape | TextShape
export type ShapeKind = Shape['kind']

export interface DrawDoc {
  version: typeof DRAW_DOC_VERSION
  /** 논리 캔버스 크기 — 내보내기는 내용 bbox로 fit하므로 편집 좌표계 역할 */
  width: number
  height: number
  shapes: Shape[]
}

export function emptyDoc(width = 960, height = 540): DrawDoc {
  return { version: DRAW_DOC_VERSION, width, height, shapes: [] }
}
