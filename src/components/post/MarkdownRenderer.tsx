import {
  isValidElement,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import type { ElementContent } from 'hast'
import 'katex/dist/katex.min.css'

type PreProps = ComponentPropsWithoutRef<'pre'> & ExtraProps

function extractText(nodes: ElementContent[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map((n) =>
      n.type === 'text' ? n.value : 'children' in n ? extractText(n.children) : '',
    )
    .join('')
}

/**
 * 코드 블럭 래퍼 — hover 시 좌상단에 언어, 우상단에 COPY 버튼 표시 (Obsidian 방식).
 * 좌측에 줄 번호 거터를 렌더 — 줄 수는 hast 노드에서 렌더 시점에 동기 계산한다.
 */
function CodeBlock({ node, children, ...rest }: PreProps) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  let lang = ''
  if (isValidElement(children)) {
    const className = (children.props as { className?: string }).className ?? ''
    const match = /language-([\w+#-]+)/.exec(className)
    if (match) lang = match[1]
  }

  const lineCount = Math.max(
    1,
    extractText(node?.children).replace(/\n$/, '').split('\n').length,
  )

  const copy = () => {
    // 거터(줄 번호)가 포함되지 않도록 code 요소의 텍스트만 복사한다
    const text = preRef.current?.querySelector('code')?.innerText ?? ''
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="codeblock">
      {lang && <span className="codeblock__lang">{lang}</span>}
      <button type="button" className="codeblock__copy" onClick={copy}>
        {copied ? 'COPIED!' : 'COPY'}
      </button>
      <pre ref={preRef} {...rest}>
        <span className="codeblock__lines" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
        </span>
        {children}
      </pre>
    </div>
  )
}

interface MarkdownRendererProps {
  content: string
  /** 상대 경로 이미지의 해석 기준 URL — 게시물 이미지 디렉터리 (없으면 src를 그대로 둔다) */
  assetBase?: string
}

/** 외부 URL(스킴)·절대 경로·data URI가 아닌, 게시물 디렉터리 기준 상대 참조인지 판별 */
const RELATIVE_SRC_RE = /^(?![a-z][a-z0-9+.-]*:|\/)/i

/**
 * alt 끝의 `|NN`(1~100)을 상대 크기 지시자로 해석 — `![설명|50](img)` → 기본 표시 크기의 50%.
 * 100이거나 지시자가 없으면 기본 표시 크기(scale 없음). 범위 밖이면 alt 그대로 둔다.
 */
function parseAltSize(alt: string | undefined): { alt: string; scale?: number } {
  const m = /^(.*)\|(\d{1,3})\s*$/.exec(alt ?? '')
  if (m) {
    const n = Number(m[2])
    if (n >= 1 && n <= 100) {
      return { alt: m[1].trim(), scale: n < 100 ? n : undefined }
    }
  }
  return { alt: alt ?? '' }
}

/** 게시물 뷰어와 에디터 프리뷰가 공용으로 사용하는 Markdown 렌더러 */
function MarkdownRenderer({ content, assetBase }: MarkdownRendererProps) {
  const components = useMemo<Components>(
    () => ({
      pre: CodeBlock,
      img: ({ node, src, alt, ...rest }) => {
        void node
        const resolved =
          assetBase && typeof src === 'string' && RELATIVE_SRC_RE.test(src)
            ? assetBase + src
            : src
        const { alt: cleanAlt, scale } = parseAltSize(alt)
        return (
          <img
            {...rest}
            src={resolved}
            alt={cleanAlt}
            loading="lazy"
            // 기본 표시 크기(= min(원본, 컨테이너 폭)) 기준 상대 크기.
            // min(원본×N%, 컨테이너×N%)로 두 경우를 모두 처리하며, %항 덕분에
            // 창 크기 변화에도 비율이 유지된다. naturalWidth는 로드 후에만 알 수
            // 있어 DOM에 직접 적용하고, scale이 없으면 이전 값을 비워
            // 지시자 제거·수정에도 반영되게 한다.
            ref={(img) => {
              if (!img) return
              const apply = () => {
                img.style.width =
                  scale && img.naturalWidth
                    ? `min(${Math.round((img.naturalWidth * scale) / 100)}px, ${scale}%)`
                    : ''
              }
              if (img.complete) apply()
              else img.addEventListener('load', apply, { once: true })
            }}
          />
        )
      },
    }),
    [assetBase],
  )

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight, rehypeSlug]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
