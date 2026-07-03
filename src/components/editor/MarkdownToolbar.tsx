import type { RefObject } from 'react'

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (content: string) => void
}

/** 선택 영역에서 Markdown 서식 문법을 제거 */
function stripFormatting(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '') // 제목
    .replace(/^>\s?/gm, '') // 인용
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 굵게
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1') // 기울임
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1') // 취소선
    .replace(/<\/?u>/g, '') // 밑줄
    .replace(/`([^`]*)`/g, '$1') // 인라인 코드
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크
}

/**
 * 에디터 textarea 위의 Markdown 스타일 도구바.
 * 텍스트를 선택한 뒤 버튼을 누르면 해당 서식이 적용된다.
 * 가장 좌측은 '스타일 제거' — 선택 영역의 서식 문법을 걷어낸다.
 */
function MarkdownToolbar({ textareaRef, onChange }: MarkdownToolbarProps) {
  /** 변경된 본문을 반영하고 지정 구간을 다시 선택 상태로 만든다 */
  const commit = (next: string, selStart: number, selEnd: number) => {
    onChange(next)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(selStart, selEnd)
    })
  }

  /** 선택 영역을 prefix/suffix로 감싼다 (B, I, U, S, 코드, 링크) */
  const wrap = (prefix: string, suffix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: start, selectionEnd: end, value } = ta
    const selected = value.slice(start, end)
    const next =
      value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    commit(next, start + prefix.length, end + prefix.length)
  }

  /**
   * 선택 영역이 걸친 모든 줄의 머리에 prefix를 붙인다 (제목, 인용).
   * 기존 제목/인용 접두어는 교체된다.
   */
  const prefixLines = (prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: start, selectionEnd: end, value } = ta
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = value.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
    const block = value.slice(lineStart, lineEnd)
    const replaced = block
      .split('\n')
      .map((line) => prefix + line.replace(/^(#{1,6}\s+|>\s?)/, ''))
      .join('\n')
    const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd)
    commit(next, lineStart, lineStart + replaced.length)
  }

  const clearStyle = () => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: start, selectionEnd: end, value } = ta
    const cleaned = stripFormatting(value.slice(start, end))
    const next = value.slice(0, start) + cleaned + value.slice(end)
    commit(next, start, start + cleaned.length)
  }

  return (
    <div className="mdbar" role="toolbar" aria-label="Markdown 서식">
      <button
        type="button"
        className="mdbar__clear"
        title="스타일 제거하기"
        onClick={clearStyle}
      >
        CLR
      </button>
      <span className="mdbar__sep" />
      <button type="button" title="굵게" onClick={() => wrap('**', '**')}>
        B
      </button>
      <button type="button" title="기울임" onClick={() => wrap('*', '*')}>
        <em>I</em>
      </button>
      <button type="button" title="밑줄" onClick={() => wrap('<u>', '</u>')}>
        <u>U</u>
      </button>
      <button type="button" title="취소선" onClick={() => wrap('~~', '~~')}>
        <s>S</s>
      </button>
      <span className="mdbar__sep" />
      <button type="button" title="제목 1" onClick={() => prefixLines('# ')}>
        H1
      </button>
      <button type="button" title="제목 2" onClick={() => prefixLines('## ')}>
        H2
      </button>
      <button type="button" title="제목 3" onClick={() => prefixLines('### ')}>
        H3
      </button>
      <span className="mdbar__sep" />
      <button type="button" title="인라인 코드" onClick={() => wrap('`', '`')}>
        {'<>'}
      </button>
      <button
        type="button"
        title="코드 블럭"
        onClick={() => wrap('\n```\n', '\n```\n')}
      >
        {'```'}
      </button>
      <button type="button" title="인용" onClick={() => prefixLines('> ')}>
        ❝
      </button>
      <button
        type="button"
        title="링크"
        onClick={() => wrap('[', '](url)')}
      >
        LINK
      </button>
    </div>
  )
}

export default MarkdownToolbar
