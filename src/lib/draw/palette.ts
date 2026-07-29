/**
 * 도형 팔레트 — NieR 테마 다이어그램 색 대응표(reference-files/g1gc-palette-nier.svg)의
 * 코드판. 도형은 색 hex가 아니라 role 키를 저장하므로, 여기 값을 조정하면
 * 새로 내보내는 SVG에 일괄 반영된다(이미 내보낸 SVG는 hex 고정 — 게시물 안정성).
 *
 * stroke/fill은 nier.css 변수 및 코드 테마 검증색에서 파생:
 * fill은 panel(#f2ecda) × 강조색 20% 틴트. label은 채움 위 글자색.
 */

export interface RoleDef {
  key: RoleKey
  name: string
  stroke: string
  /** 'none'이면 윤곽선만 */
  fill: string
  /** 도형 내부 라벨 글자색 */
  label: string
}

export type RoleKey =
  | 'plain'
  | 'alert'
  | 'teal'
  | 'dark'
  | 'orange'
  | 'olive'
  | 'free'
  | 'danger'
  | 'note'

export const ROLES: RoleDef[] = [
  { key: 'plain', name: '기본(윤곽)', stroke: '#4c4a43', fill: 'none', label: '#454138' },
  { key: 'alert', name: '적갈', stroke: '#b05a4a', fill: '#e5cfbd', label: '#454138' },
  { key: 'teal', name: '청록', stroke: '#3d7f77', fill: '#ced6c6', label: '#454138' },
  { key: 'dark', name: '무채', stroke: '#4c4a43', fill: '#d1ccbc', label: '#454138' },
  { key: 'orange', name: '주황', stroke: '#ba430c', fill: '#e7cab1', label: '#454138' },
  { key: 'olive', name: '올리브', stroke: '#6d7a4f', fill: '#d7d5be', label: '#454138' },
  { key: 'free', name: '중립(점선)', stroke: '#a99f82', fill: '#ece5cf', label: '#7a7666' },
  { key: 'danger', name: '경고(반전)', stroke: '#c63316', fill: '#b05a4a', label: '#ede6d2' },
  { key: 'note', name: '패널', stroke: '#b7ad8f', fill: '#f2ecda', label: '#454138' },
]

const BY_KEY = new Map(ROLES.map((r) => [r.key, r]))

export function roleDef(key: RoleKey): RoleDef {
  const def = BY_KEY.get(key)
  if (!def) throw new Error(`알 수 없는 팔레트 role: ${key}`)
  return def
}

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && BY_KEY.has(value as RoleKey)
}

/** 내보내기 SVG의 글꼴 — 게시물 본문과 동일 계열 */
export const DRAW_FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
