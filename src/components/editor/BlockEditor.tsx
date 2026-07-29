import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { livePreview } from './livePreview'
import type { EditorTextApi } from './MarkdownToolbar'

/** 에디터 일반 모드의 외부 조작 API — 이미지·그래프 삽입, 도구바 연동 */
export interface BlockEditorHandle {
  /** 커서 위치(선택 대체)에 텍스트 삽입 */
  insertAtCursor: (text: string) => void
  /** MarkdownToolbar가 쓰는 textarea 호환 표면 — 값·선택이 문서 전체 기준 */
  textApi: EditorTextApi
}

interface BlockEditorProps {
  content: string
  onChange: (content: string) => void
  handleRef: RefObject<BlockEditorHandle | null>
  assetBase?: string
  onUploadImages?: (files: File[]) => void
  /** 로컬 도형 svg 이미지 위젯의 '도형 EDIT' 칩 → DrawComposer 열기 */
  onEditDrawing?: (name: string) => void
}

/**
 * 일반 모드 편집기 — CodeMirror 6 기반 라이브 프리뷰(livePreview.tsx).
 * 문서 전체가 하나의 연속된 편집 캔버스이고, content 마크다운 문자열이 곧
 * 에디터 문서라 변환 손실이 없다. 게시물 전환 시에는 EditorPage가 key로
 * 리마운트해 undo 히스토리를 격리한다.
 */
function BlockEditor({
  content,
  onChange,
  handleRef,
  assetBase,
  onUploadImages,
  onEditDrawing,
}: BlockEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const stateRef = useRef({ content, onChange, onUploadImages, onEditDrawing })
  useLayoutEffect(() => {
    stateRef.current = { content, onChange, onUploadImages, onEditDrawing }
  })

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: stateRef.current.content,
        extensions: [
          // onEditDrawing은 stable 래퍼로 넘긴다 — 위젯 eq가 콜백을 비교하지 않는 전제
          livePreview({ assetBase, onEditDrawing: (name) => stateRef.current.onEditDrawing?.(name) }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) stateRef.current.onChange(u.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            paste: (e) => {
              const files = Array.from(e.clipboardData?.files ?? [])
              if (files.some((f) => f.type.startsWith('image/'))) {
                e.preventDefault()
                stateRef.current.onUploadImages?.(files)
                return true
              }
              return false
            },
            drop: (e) => {
              const files = Array.from(e.dataTransfer?.files ?? [])
              if (files.some((f) => f.type.startsWith('image/'))) {
                e.preventDefault()
                stateRef.current.onUploadImages?.(files)
                return true
              }
              return false
            },
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [assetBase])

  // 외부 변경(코드 모드 편집·도구바 서식)을 문서에 반영 — 자체 입력 에코는 동일하므로 무시
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur !== content) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: content } })
    }
  }, [content])

  const api = useMemo<BlockEditorHandle>(
    () => ({
      insertAtCursor: (text) => {
        const view = viewRef.current
        if (!view) return
        view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true })
        view.focus()
      },
      textApi: {
        get value() {
          return viewRef.current?.state.doc.toString() ?? ''
        },
        get selectionStart() {
          return viewRef.current?.state.selection.main.from ?? 0
        },
        get selectionEnd() {
          return viewRef.current?.state.selection.main.to ?? 0
        },
        focus() {
          viewRef.current?.focus()
        },
        setSelectionRange(start: number, end: number) {
          const view = viewRef.current
          if (!view) return
          const len = view.state.doc.length
          view.dispatch({
            selection: { anchor: Math.min(start, len), head: Math.min(end, len) },
            scrollIntoView: true,
          })
        },
      },
    }),
    [],
  )

  useEffect(() => {
    handleRef.current = api
    return () => {
      handleRef.current = null
    }
  }, [api, handleRef])

  return <div ref={hostRef} className="blockeditor" />
}

export default BlockEditor
