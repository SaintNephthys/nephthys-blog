/**
 * 일반 모드 라이브 프리뷰 — CodeMirror 6 확장.
 *
 * 문서는 마크다운 원문 그대로(content 단일 원천, 바이트 보존)이고, 이 확장이
 * 데코레이션으로 "보이는 모습"만 바꾼다:
 * - 블록 마커(#·>·-)는 항상 숨기고 스타일(제목 크기·인용 바·불릿)로 대체 —
 *   항상 같은 모습이므로 클릭·편집 전환 시 텍스트가 절대 움직이지 않는다.
 * - 인라인 마커(**·*·~~·`·링크·<u>)는 커서가 해당 토큰 밖일 때만 숨긴다
 *   (토큰 안에 캐럿이 들어가면 그 자리에서만 원문이 열려 편집 가능).
 * - 코드/그래프 펜스·$$ 수식·표·이미지·수평선·<br> 스페이서는 커서가 밖일 때
 *   MarkdownRenderer 위젯(게시물과 동일 렌더)으로 표시되고, 커서가 들어가면
 *   raw로 열린다. 펜스는 내부 인터랙션(그래프 슬라이더·COPY) 보호를 위해
 *   클릭 대신 hover EDIT 칩으로 진입한다.
 *
 * Enter는 코드 모드와 같은 markdownLineBreak 의미론(내용 줄 hard break·빈 줄
 * 연속 <br>)을 쓰고, 목록은 마커 자동 연속(빈 항목이면 해제), 인용은 hard break
 * + `> ` 연속이다(soft break는 게시물 렌더에서 줄이 합쳐져 미리보기와 어긋난다).
 */
import {
  EditorState,
  Prec,
  RangeSet,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  placeholder,
  type Command,
  type DecorationSet,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
} from '@codemirror/lang-markdown'
import { createRoot, type Root } from 'react-dom/client'
import MarkdownRenderer from '../post/MarkdownRenderer'
import { markdownLineBreak } from '../../lib/markdownEdit'

/** 위젯 종류 — fence: 펜스(EDIT 칩·이벤트 격리), block: 수식/표(클릭 시 raw), inline: 이미지·인라인 수식 */
type WidgetKind = 'fence' | 'block' | 'image' | 'imath'

const widgetRoots = new WeakMap<HTMLElement, Root>()

/** 마크다운 조각을 게시물과 동일한 MarkdownRenderer로 그리는 위젯 */
class RenderWidget extends WidgetType {
  readonly source: string
  readonly kind: WidgetKind
  readonly assetBase?: string

  constructor(source: string, kind: WidgetKind, assetBase?: string) {
    super()
    this.source = source
    this.kind = kind
    this.assetBase = assetBase
  }

  eq(other: RenderWidget) {
    return (
      other.source === this.source &&
      other.kind === this.kind &&
      other.assetBase === this.assetBase
    )
  }

  toDOM() {
    const inline = this.kind === 'image' || this.kind === 'imath'
    const wrap = document.createElement(inline ? 'span' : 'div')
    wrap.className = `blockeditor__widget blockeditor__widget--${this.kind}`
    const root = createRoot(wrap)
    widgetRoots.set(wrap, root)
    root.render(
      <>
        <MarkdownRenderer content={this.source} assetBase={this.assetBase} />
        {this.kind === 'fence' && (
          <button
            type="button"
            className="blockeditor__edit"
            onClick={() => {
              // 위젯은 CM 밖의 React 루트라 view를 DOM에서 역추적한다
              const editor = wrap.closest('.cm-editor')
              const view = editor && EditorView.findFromDOM(editor as HTMLElement)
              if (!view) return
              const pos = view.posAtDOM(wrap)
              const nl = this.source.indexOf('\n')
              view.dispatch({
                selection: { anchor: pos + (nl === -1 ? 0 : nl + 1) },
                scrollIntoView: true,
              })
              view.focus()
            }}
          >
            EDIT
          </button>
        )}
      </>,
    )
    return wrap
  }

  destroy(dom: HTMLElement) {
    // CM 업데이트 중 동기 unmount를 피한다
    queueMicrotask(() => widgetRoots.get(dom)?.unmount())
  }

  ignoreEvent() {
    // 펜스 위젯 내부(그래프 슬라이더·COPY·EDIT)는 CM이 개입하지 않는다.
    // 그 외에는 클릭이 CM으로 흘러 커서가 놓이고 → raw가 열린다.
    return this.kind === 'fence'
  }
}

/** 불릿 마커(`- `)를 대신하는 장식 — 항상 이 모습이라 편집 전환에도 불변 */
class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-bullet'
    s.textContent = '•'
    return s
  }
  ignoreEvent() {
    return false
  }
}
const bulletWidget = new BulletWidget()

/** 수평선·<br> 스페이서처럼 단순 CSS 장식으로 충분한 줄 위젯 */
class LineWidget extends WidgetType {
  readonly cls: string

  constructor(cls: string) {
    super()
    this.cls = cls
  }
  eq(other: LineWidget) {
    return other.cls === this.cls
  }
  toDOM() {
    const d = document.createElement('div')
    d.className = this.cls
    d.innerHTML = '&nbsp;'
    return d
  }
  ignoreEvent() {
    return false
  }
}

const SPACER_LINE_RE = /^<br\s*\/?>\s*$/i
const MATH_OPEN_RE = /^\s{0,3}\$\$/

interface Span {
  from: number
  to: number
}

/** $$ 수식 블록 스캔 — lezer 마크다운 트리에는 수식 노드가 없어 줄 단위로 찾는다 */
function scanMathBlocks(state: EditorState, skip: Span[]): Span[] {
  const doc = state.doc
  const out: Span[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (!MATH_OPEN_RE.test(line.text)) continue
    if (skip.some((s) => s.from <= line.to && s.to >= line.from)) continue
    const rest = line.text.trim().slice(2)
    if (rest.length > 0 && rest.endsWith('$$')) {
      out.push({ from: line.from, to: line.to })
      continue
    }
    let j = i + 1
    while (j <= doc.lines && !/\$\$\s*$/.test(doc.line(j).text)) j++
    out.push({ from: line.from, to: doc.line(Math.min(j, doc.lines)).to })
    i = j
  }
  return out
}

interface PreviewSets {
  deco: DecorationSet
  atomic: RangeSet<Decoration>
}

/** 상태 → 데코레이션. 선택이 닿은 구간은 raw로 열리므로 선택 변경 때마다 재계산한다 */
function build(state: EditorState, assetBase?: string): PreviewSets {
  const deco: Range<Decoration>[] = []
  const atoms: Range<Decoration>[] = []
  const doc = state.doc
  const text = doc.toString()
  const sel = state.selection.ranges
  const touches = (from: number, to: number) =>
    sel.some((r) => r.from <= to && r.to >= from)

  /** 마커 숨김 — atomic이라 캐럿이 안에 끼지 않고, Backspace가 통째로 걷는다 */
  const hide = (from: number, to: number) => {
    if (from >= to) return
    const d = Decoration.replace({})
    deco.push(d.range(from, to))
    atoms.push(d.range(from, to))
  }
  const lineClass = (pos: number, cls: string, style?: string) => {
    deco.push(
      Decoration.line({ class: cls, ...(style ? { attributes: { style } } : {}) }).range(
        doc.lineAt(pos).from,
      ),
    )
  }
  const eachLine = (from: number, to: number, f: (pos: number) => void) => {
    for (let p = from; p <= to; ) {
      const line = doc.lineAt(p)
      f(line.from)
      p = line.to + 1
    }
  }
  const blockWidget = (from: number, to: number, kind: WidgetKind) => {
    deco.push(
      Decoration.replace({
        widget: new RenderWidget(text.slice(from, to), kind, assetBase),
        block: true,
      }).range(from, to),
    )
  }
  /** 마크 뒤 공백 하나까지 마커로 취급 (`# `·`> `·`- `) */
  const markEnd = (to: number) => (text[to] === ' ' ? to + 1 : to)

  const fences: Span[] = []
  const inlineCodes: Span[] = []
  const paragraphs: Span[] = []
  const quoteDepth = new Map<number, number>()

  syntaxTree(state).iterate({
    enter: (n) => {
      const name = n.name
      if (name.startsWith('ATXHeading')) {
        lineClass(n.from, `cm-h cm-h${name.slice(10)}`)
        const mark = n.node.getChild('HeaderMark')
        if (mark) hide(mark.from, markEnd(mark.to))
        return
      }
      switch (name) {
        case 'QuoteMark': {
          hide(n.from, markEnd(n.to))
          const lf = doc.lineAt(n.from).from
          quoteDepth.set(lf, (quoteDepth.get(lf) ?? 0) + 1)
          return
        }
        case 'ListMark': {
          const line = doc.lineAt(n.from)
          const markText = text.slice(n.from, n.to)
          if (/^\d/.test(markText)) {
            deco.push(Decoration.mark({ class: 'cm-listnum' }).range(n.from, n.to))
          } else {
            const d = Decoration.replace({ widget: bulletWidget })
            deco.push(d.range(n.from, markEnd(n.to)))
            atoms.push(d.range(n.from, markEnd(n.to)))
          }
          // 들여쓰기 비례 hanging indent — 줄바꿈된 텍스트도 마커 안쪽으로 정렬
          const col = n.from - line.from
          lineClass(n.from, 'cm-li', `padding-left: ${(col * 0.6 + 1.6).toFixed(1)}em`)
          return
        }
        case 'FencedCode': {
          fences.push({ from: n.from, to: n.to })
          if (!touches(n.from, n.to)) {
            blockWidget(n.from, n.to, 'fence')
            return false
          }
          eachLine(n.from, n.to, (p) => lineClass(p, 'cm-rawblock'))
          return false
        }
        case 'Table': {
          if (!touches(n.from, n.to)) {
            blockWidget(n.from, n.to, 'block')
          } else {
            eachLine(n.from, n.to, (p) => lineClass(p, 'cm-rawblock'))
          }
          return false
        }
        case 'HTMLBlock': {
          if (SPACER_LINE_RE.test(text.slice(n.from, n.to)) && !touches(n.from, n.to)) {
            deco.push(
              Decoration.replace({ widget: new LineWidget('cm-blankline'), block: true }).range(
                n.from,
                n.to,
              ),
            )
          }
          return false
        }
        case 'HorizontalRule': {
          if (!touches(n.from, n.to)) {
            deco.push(
              Decoration.replace({ widget: new LineWidget('cm-mdhr'), block: true }).range(
                n.from,
                n.to,
              ),
            )
          }
          return
        }
        case 'Paragraph':
          paragraphs.push({ from: n.from, to: n.to })
          return
        case 'StrongEmphasis':
        case 'Emphasis':
        case 'Strikethrough': {
          const cls =
            name === 'StrongEmphasis' ? 'cm-strong' : name === 'Emphasis' ? 'cm-em' : 'cm-strike'
          deco.push(Decoration.mark({ class: cls }).range(n.from, n.to))
          if (!touches(n.from, n.to)) {
            for (const m of n.node.getChildren(
              name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark',
            ))
              hide(m.from, m.to)
          }
          return
        }
        case 'InlineCode': {
          inlineCodes.push({ from: n.from, to: n.to })
          deco.push(Decoration.mark({ class: 'cm-ic' }).range(n.from, n.to))
          if (!touches(n.from, n.to)) {
            for (const m of n.node.getChildren('CodeMark')) hide(m.from, m.to)
          }
          return
        }
        case 'Link': {
          deco.push(Decoration.mark({ class: 'cm-mdlink' }).range(n.from, n.to))
          if (!touches(n.from, n.to)) {
            for (const m of n.node.getChildren('LinkMark')) hide(m.from, m.to)
            const url = n.node.getChild('URL')
            if (url) hide(url.from, url.to)
          }
          return
        }
        case 'Image': {
          if (!touches(n.from, n.to)) {
            const d = Decoration.replace({
              widget: new RenderWidget(text.slice(n.from, n.to), 'image', assetBase),
            })
            deco.push(d.range(n.from, n.to))
            atoms.push(d.range(n.from, n.to))
          }
          return false
        }
      }
    },
  })

  // $$ 수식 블록 — 커서 밖이면 KaTeX 위젯, 안이면 raw 줄
  const mathBlocks = scanMathBlocks(state, fences)
  for (const m of mathBlocks) {
    if (!touches(m.from, m.to)) blockWidget(m.from, m.to, 'block')
    else eachLine(m.from, m.to, (p) => lineClass(p, 'cm-rawblock'))
  }

  // 인용 줄 스타일 (깊이 비례 들여쓰기)
  for (const [lf, depth] of quoteDepth) {
    deco.push(
      Decoration.line({ class: 'cm-quote', attributes: { style: `--qd: ${depth}` } }).range(lf),
    )
  }

  // 문단 후처리 — 인라인 $수식$과 <u> 태그 (트리에 노드가 없는 구문)
  const overlaps = (spans: Span[], from: number, to: number) =>
    spans.some((s) => s.from < to && s.to > from)
  for (const p of paragraphs) {
    if (overlaps(mathBlocks, p.from, p.to)) continue
    const ptext = text.slice(p.from, p.to)
    for (const m of ptext.matchAll(/<u>([\s\S]*?)<\/u>/gi)) {
      const s = p.from + m.index
      const e = s + m[0].length
      deco.push(Decoration.mark({ class: 'cm-u' }).range(s + 3, e - 4))
      if (!touches(s, e)) {
        hide(s, s + 3)
        hide(e - 4, e)
      }
    }
    for (const m of ptext.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g)) {
      const inner = m[1]
      if (inner.trim() !== inner || inner === '') continue
      const s = p.from + m.index
      const e = s + m[0].length
      if (overlaps(inlineCodes, s, e)) continue
      if (!touches(s, e)) {
        const d = Decoration.replace({
          widget: new RenderWidget(m[0], 'imath', assetBase),
        })
        deco.push(d.range(s, e))
        atoms.push(d.range(s, e))
      }
    }
  }

  return { deco: RangeSet.of(deco, true), atomic: RangeSet.of(atoms, true) }
}

const QUOTE_LINE_RE = /^(\s*(?:>[ \t]?)+)(.*)$/
const LIST_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s/

/**
 * Enter — 코드 모드와 같은 줄바꿈 의미론(markdownLineBreak) + 목록·인용 연속.
 * 표·펜스 내부는 순수 개행에 맡긴다.
 */
const smartEnter: Command = (view) => {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  // 표 내부: 순수 개행 (행 추가)
  for (
    let n: SyntaxNode | null = syntaxTree(state).resolveInner(range.head, -1);
    n;
    n = n.parent
  ) {
    if (n.name === 'Table') return false
  }
  const quote = QUOTE_LINE_RE.exec(line.text)
  if (quote) {
    if (quote[2].trim() === '') {
      // 빈 인용 줄에서 Enter → 마커를 걷어 인용 종료 (lang-markdown은 인용을 계속 잇는다)
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        scrollIntoView: true,
        userEvent: 'delete',
      })
      return true
    }
    // 인용 안 줄바꿈 — soft break는 게시물 렌더에서 줄이 합쳐지므로 hard break + 마커
    view.dispatch(state.replaceSelection('  \n' + quote[1]), {
      scrollIntoView: true,
      userEvent: 'input',
    })
    return true
  }
  if (LIST_LINE_RE.test(line.text)) return insertNewlineContinueMarkup(view)
  // 제목 줄 끝 Enter — hard break 마커가 필요 없다 (제목은 자체로 블록)
  if (/^\s{0,3}#{1,6}\s/.test(line.text)) return false
  const brk = markdownLineBreak(state.doc.toString(), range.head)
  if (brk === null) return false
  view.dispatch(state.replaceSelection(brk), { scrollIntoView: true, userEvent: 'input' })
  return true
}

/** 줄 머리의 블록 마커 (제목·인용·목록) — 숨겨져 있어도 원문에는 존재한다 */
const LINE_MARKER_RE = /^(\s{0,3}#{1,6}\s|\s*(?:>[ \t]?)+|\s*(?:[-*+]|\d{1,9}[.)])\s+)/

/**
 * Backspace — 캐럿이 숨겨진 줄 머리 마커 범위 안(시각적 줄 시작)이면 마커를 걷어
 * 문단으로 강등한다(캐럿이 마커 앞/뒤 어느 경계에 정규화되어도 동일). 그 외에는
 * lang-markdown의 단계적 마커 제거 → 기본 삭제로 이어진다.
 */
const smartBackspace: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  const m = LINE_MARKER_RE.exec(line.text)
  if (m && sel.head <= line.from + m[1].length && line.text.length > m[1].length) {
    view.dispatch({
      changes: { from: line.from, to: line.from + m[1].length, insert: '' },
      userEvent: 'delete',
    })
    return true
  }
  return deleteMarkupBackward(view)
}

/** Shift+Enter — 순수 개행 (코드 모드와 동일한 탈출구) */
const plainEnter: Command = (view) => {
  view.dispatch(view.state.replaceSelection('\n'), {
    scrollIntoView: true,
    userEvent: 'input',
  })
  return true
}

export interface LivePreviewConfig {
  assetBase?: string
}

/** 일반 모드 에디터 확장 세트 — BlockEditor가 EditorView에 그대로 넘긴다 */
export function livePreview({ assetBase }: LivePreviewConfig): Extension {
  const field = StateField.define<PreviewSets>({
    create: (state) => build(state, assetBase),
    update: (value, tr) =>
      tr.docChanged || tr.selection ? build(tr.state, assetBase) : value,
    provide: (f) => [
      EditorView.decorations.from(f, (v) => v.deco),
      EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
    ],
  })

  return [
    markdown({ base: markdownLanguage }),
    history(),
    // drawSelection()을 쓰지 않는다 — 네이티브 선택이어야 전역 ::selection(반전)이 적용된다
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off' }),
    placeholder('본문 작성… (# 제목 · > 인용 · - 목록 · $$수식$$ · ``` 코드 — 기호는 입력 즉시 스타일로 바뀝니다)'),
    // markdown()이 자체 keymap을 Prec.high로 등록하므로 Enter 재정의는 그보다 높게
    Prec.highest(
      keymap.of([
        { key: 'Enter', run: smartEnter },
        { key: 'Shift-Enter', run: plainEnter },
        { key: 'Backspace', run: smartBackspace },
      ]),
    ),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    field,
  ]
}
