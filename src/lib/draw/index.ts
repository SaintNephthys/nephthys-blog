/**
 * lib/draw 공개 표면 — UI(DrawComposer)·CLI(scripts/draw-cli.mjs)·차후 MCP가
 * 공유하는 단일 진입점. CLI는 rolldown으로 이 파일을 번들해 사용한다.
 */

export { DRAW_DOC_VERSION, emptyDoc } from './types'
export type {
  DrawDoc,
  Shape,
  RectShape,
  EllipseShape,
  LineShape,
  TextShape,
  TextStyle,
} from './types'
export { ROLES, roleDef, isRoleKey, DRAW_FONT, DRAW_FONT_MONO } from './palette'
export type { RoleKey, RoleDef } from './palette'
export {
  addShape,
  alignShapes,
  bringToFront,
  distributeShapes,
  docBBox,
  duplicateShapes,
  newShapeId,
  normalizeBox,
  removeShape,
  sendToBack,
  shapeBBox,
  translateShape,
  updateShape,
} from './ops'
export type { AlignMode } from './ops'
export { containsPoint, findBindTarget, reflowBindings } from './bind'
export { docToSvg, svgToDoc, docFromJson, docErrors } from './svg'
export type { ToSvgOptions } from './svg'
