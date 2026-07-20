import { useRef, useState } from 'react'
import GraphComposer from './GraphComposer'

/**
 * 도구바가 조작하는 편집 표면 — 코드 모드의 textarea가 그대로 만족하고,
 * 일반 모드는 BlockEditor(CodeMirror)가 문서 전체 기준으로 구현해 제공한다.
 */
export interface EditorTextApi {
  value: string
  readonly selectionStart: number
  readonly selectionEnd: number
  focus(): void
  setSelectionRange(start: number, end: number): void
}

/** 본문 편집 모드 — rich: 라이브 편집(일반), code: raw 마크다운(코드) */
export type EditMode = 'rich' | 'code'

interface MarkdownToolbarProps {
  editorRef: { readonly current: EditorTextApi | null }
  onChange: (content: string) => void
  /** 이미지 파일 선택 시 업로드 위임 (미지정 시 IMG 버튼 미노출) */
  onUploadImages?: (files: File[]) => void
  /**
   * 커서 위치 텍스트 삽입 위임 (GRAPH boilerplate용) — 삽입 규칙이 모드마다
   * 다른 환경에서 지정한다. 미지정 시 내부 편집 표면 삽입 사용.
   */
  insertText?: (text: string) => void
  /** 도구바 우측 끝의 일반/코드 모드 토글 */
  mode: EditMode
  onModeChange: (mode: EditMode) => void
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
function MarkdownToolbar({
  editorRef,
  onChange,
  onUploadImages,
  insertText,
  mode,
  onModeChange,
}: MarkdownToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [graphOpen, setGraphOpen] = useState(false)

  /** 변경된 본문을 반영하고 지정 구간을 다시 선택 상태로 만든다 */
  const commit = (next: string, selStart: number, selEnd: number) => {
    onChange(next)
    requestAnimationFrame(() => {
      const ta = editorRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(selStart, selEnd)
    })
  }

  /** 선택 영역을 prefix/suffix로 감싼다 (B, I, U, S, 코드, 링크) */
  const wrap = (prefix: string, suffix: string) => {
    const ta = editorRef.current
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
    const ta = editorRef.current
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

  /** 커서 위치(선택 영역 대체)에 텍스트 삽입 — GRAPH boilerplate용 */
  const insertAtCursor = (text: string) => {
    const ta = editorRef.current
    if (!ta) return
    const { selectionStart: start, selectionEnd: end, value } = ta
    const next = value.slice(0, start) + text + value.slice(end)
    const pos = start + text.length
    commit(next, pos, pos)
  }

  const clearStyle = () => {
    const ta = editorRef.current
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
      {onUploadImages && (
        <>
          <button
            type="button"
            title="이미지 삽입 (붙여넣기/드롭도 가능)"
            onClick={() => fileInputRef.current?.click()}
          >
            IMG
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) onUploadImages(Array.from(e.target.files))
              e.target.value = '' // 같은 파일 재선택 허용
            }}
          />
        </>
      )}
      <button
        type="button"
        title="그래프 삽입 (```graph boilerplate)"
        onClick={() => setGraphOpen(true)}
      >
        GRAPH
      </button>
      <div className="mdbar__mode" role="tablist" aria-label="본문 편집 모드">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'rich'}
          className={mode === 'rich' ? 'active' : ''}
          onClick={() => onModeChange('rich')}
          title="라이브 편집 — 기호는 숨겨지고 스타일로 보인다"
        >
          일반
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'code'}
          className={mode === 'code' ? 'active' : ''}
          onClick={() => onModeChange('code')}
          title="Markdown 원문 편집"
        >
          코드
        </button>
      </div>
      {graphOpen && (
        <GraphComposer
          onInsert={insertText ?? insertAtCursor}
          onClose={() => setGraphOpen(false)}
        />
      )}
    </div>
  )
}

export default MarkdownToolbar
