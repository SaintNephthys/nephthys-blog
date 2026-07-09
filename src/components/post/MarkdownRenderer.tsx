import {
  isValidElement,
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
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

// 함수 그래프는 d3 청크가 초기 번들·PostPage 청크에 섞이지 않도록 lazy —
// graph 펜스가 있는 게시물에서만 로드된다 (KaTeX와 동일한 격리 원칙)
const FunctionGraph = lazy(() => import('./graph/FunctionGraph'))

type PreProps = ComponentPropsWithoutRef<'pre'> & ExtraProps

/** 코드 펜스의 언어를 <code class="language-…">에서 추출 */
function fenceLang(children: ReactNode): string {
  if (!isValidElement(children)) return ''
  const className = (children.props as { className?: string }).className ?? ''
  return /language-([\w+#-]+)/.exec(className)?.[1] ?? ''
}

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

  const lang = fenceLang(children)

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

/**
 * pre 오버라이드 — ```graph 펜스는 인터랙티브 함수 그래프로,
 * 그 외에는 기존 CodeBlock으로 렌더한다.
 */
function PreOrGraph(props: PreProps) {
  if (fenceLang(props.children) === 'graph') {
    const spec = extractText(props.node?.children).replace(/\n$/, '')
    return (
      <Suspense
        fallback={<div className="fngraph fngraph--loading">GRAPH LOADING…</div>}
      >
        <FunctionGraph spec={spec} />
      </Suspense>
    )
  }
  return <CodeBlock {...props} />
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
      pre: PreOrGraph,
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
        rehypePlugins={[
          rehypeRaw,
          rehypeKatex,
          // graph 펜스는 스펙 텍스트이므로 하이라이팅 대상에서 제외
          [rehypeHighlight, { plainText: ['graph'] }],
          rehypeSlug,
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
