/**
 * 에디터의 마크다운 텍스트 편집 유틸리티.
 * - markdownLineBreak: Enter 입력 → 마크다운 줄바꿈 문자
 *   (코드 모드 textarea + 일반 모드 CodeMirror smartEnter가 공용)
 */

/**
 * Enter 입력을 마크다운 줄바꿈 문자로 바꾼다 — 일반 블로그 에디터처럼 Enter 횟수만큼
 * 렌더 결과의 줄이 벌어지게 한다. null이면 기본 개행(순수 \n)에 맡긴다.
 * - 내용이 있는 줄: `"  \n"` (두 칸 공백 + 개행 — 마크다운 hard break)
 * - 빈 줄에서 첫 Enter: null (\n\n이 되어 문단 구분 — 이미 한 줄 벌어진다)
 * - 빈 줄이 이어질 때: `"<br>\n\n"` (마크다운은 연속 빈 줄을 하나로 접으므로 rehype-raw로 렌더.
 *   줄 시작의 <br>은 HTML 블록이 되어 다음 빈 줄까지의 텍스트를 삼키므로 빈 줄로 즉시 닫는다)
 * - 코드 펜스 내부, 이미 줄바꿈 마커(`  `·`\`·<br>)로 끝나는 줄: null (원문 보존)
 */
export function markdownLineBreak(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor)
  const fences = before.match(/^\s{0,3}(```|~~~)/gm)
  if (fences && fences.length % 2 === 1) return null // 코드 펜스 내부
  const lineStart = before.lastIndexOf('\n') + 1
  const line = before.slice(lineStart)
  if (line.trim() !== '') {
    return /( {2}|\\|<br\s*\/?>)$/.test(line) ? null : '  \n'
  }
  if (lineStart === 0) return null // 문서 맨 앞의 빈 줄
  const prevStart = before.lastIndexOf('\n', lineStart - 2) + 1
  const prev = before.slice(prevStart, lineStart - 1).trim()
  return prev === '' || /^<br\s*\/?>$/i.test(prev) ? '<br>\n\n' : null
}
