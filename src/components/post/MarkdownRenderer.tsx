import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'

interface MarkdownRendererProps {
  content: string
}

/** 게시물 뷰어와 에디터 프리뷰가 공용으로 사용하는 Markdown 렌더러 */
function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
