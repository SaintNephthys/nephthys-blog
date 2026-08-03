/**
 * 렌더 직전 전처리 — 에디터에 보이는 줄 간격이 게시물 렌더에 그대로 나타나게 한다.
 *
 * 마크다운은 연속 빈 줄을 문단 구분 하나로 접으므로, 에디터에서 빈 줄을 여러 개
 * 두어 만든 간격이 게시물에서는 사라진다. 연속 빈 줄(2개 이상)을 Enter 연타가
 * 삽입하는 것과 같은 `<br>` 스페이서 패턴(빈 줄 + `<br>` + 빈 줄 …)으로 확장해
 * 빈 줄 수만큼 간격이 벌어지게 한다. soft break(마커 없는 개행)는 remark-breaks가
 * 처리하므로 여기서는 빈 줄만 다룬다.
 *
 * 원문(md 파일)은 손대지 않는다 — MarkdownRenderer가 렌더할 때만 적용된다.
 */

const FENCE_RE = /^\s{0,3}(```|~~~)/
const MATH_FENCE_RE = /^\s{0,3}\$\$/

export function expandBlankRuns(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inFence = false
  let inMath = false
  let run = 0 // 현재 이어지는 빈 줄 수

  const flushRun = (atEnd: boolean) => {
    if (run === 0) return
    // 문서 맨 앞·맨 끝의 빈 줄 무리는 마크다운처럼 무시(간격 의도가 아니라 잔여 공백)
    if (out.length === 0 || atEnd || run < 2) {
      for (let i = 0; i < run; i++) out.push('')
    } else {
      // k개 빈 줄 → 문단 구분(빈 줄) + (k-1)개 <br> 블럭. 줄 시작 <br>은 HTML 블럭이
      // 되어 다음 빈 줄까지 삼키므로 각 <br> 뒤를 빈 줄로 닫는다 — Enter 연타와 동일 패턴.
      out.push('')
      for (let i = 1; i < run; i++) out.push('<br>', '')
    }
    run = 0
  }

  for (const line of lines) {
    if (inFence || inMath) {
      out.push(line)
      if (inFence && FENCE_RE.test(line)) inFence = false
      else if (inMath && /\$\$\s*$/.test(line)) inMath = false
      continue
    }
    if (line.trim() === '') {
      run += 1
      continue
    }
    flushRun(false)
    out.push(line)
    if (FENCE_RE.test(line)) {
      inFence = true
    } else if (MATH_FENCE_RE.test(line)) {
      // `$$ … $$` 한 줄 완결이면 블록이 열리지 않는다
      const rest = line.trim().slice(2)
      if (!(rest.length > 0 && rest.endsWith('$$'))) inMath = true
    }
  }
  flushRun(true)
  return out.join('\n')
}
