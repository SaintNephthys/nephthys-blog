/**
 * 테마 상태 — 'tokyosky'(기본, 푸른 하늘의 22세기 도쿄) | 'cityruin'(NieR 세피아).
 * index.html의 인라인 스크립트가 첫 페인트 전에 같은 규칙으로 data-theme를
 * 설정하므로, 여기 로직과 저장 키·기본값이 항상 일치해야 한다.
 */

export type ThemeId = 'tokyosky' | 'cityruin'

const STORAGE_KEY = 'nephthys-theme'
const DEFAULT_THEME: ThemeId = 'tokyosky'

export const THEME_LABELS: Record<ThemeId, string> = {
  tokyosky: 'TOKYOSKY',
  cityruin: 'CITYRUIN',
}

export function loadTheme(): ThemeId {
  return localStorage.getItem(STORAGE_KEY) === 'cityruin' ? 'cityruin' : DEFAULT_THEME
}

/** html[data-theme] 적용 + 저장 — CSS 오버라이드 스코프가 이 속성을 본다 */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE_KEY, theme)
}
