import type { PostMeta } from '../../lib/posts'
import MarkdownRenderer from './MarkdownRenderer'
import TagList from './TagList'

interface PostViewerProps {
  meta: PostMeta
  content: string
}

function PostViewer({ meta, content }: PostViewerProps) {
  return (
    <article>
      <header className="post-view__header">
        <h1 className="post-view__title">{meta.title}</h1>
        <div className="post-view__meta">
          <span>{meta.date}</span>
          <TagList tags={meta.tags} />
        </div>
      </header>
      <MarkdownRenderer
        content={content}
        assetBase={`${import.meta.env.BASE_URL}posts/images/${meta.slug}/`}
      />
    </article>
  )
}

export default PostViewer
