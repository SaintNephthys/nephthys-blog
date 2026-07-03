import {
  isValidElement,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import 'katex/dist/katex.min.css'

type PreProps = ComponentPropsWithoutRef<'pre'> & ExtraProps

/**
 * 코드 블럭 래퍼 — hover 시 좌상단에 언어, 우상단에 COPY 버튼 표시 (Obsidian 방식)
 */
function CodeBlock({ node, children, ...rest }: PreProps) {
  void node
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  let lang = ''
  if (isValidElement(children)) {
    const className = (children.props as { className?: string }).className ?? ''
    const match = /language-([\w+#-]+)/.exec(className)
    if (match) lang = match[1]
  }

  const copy = () => {
    const text = preRef.current?.innerText ?? ''
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
        {children}
      </pre>
    </div>
  )
}

interface MarkdownRendererProps {
  content: string
}

/** 게시물 뷰어와 에디터 프리뷰가 공용으로 사용하는 Markdown 렌더러 */
function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight, rehypeSlug]}
        components={{ pre: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
