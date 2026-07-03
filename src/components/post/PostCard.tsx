import { Link } from 'react-router-dom'
import type { PostMeta } from '../../lib/posts'
import TagList from './TagList'

export type PostCardVariant = 'default' | 'search'

interface PostCardProps {
  post: PostMeta
  variant?: PostCardVariant
}

function CategoryChip({ category }: { category: string }) {
  if (!category) return null
  return (
    <Link
      to={`/category/${encodeURIComponent(category)}`}
      className="tag-chip tag-chip--category"
      onClick={(e) => e.stopPropagation()}
    >
      ▣ {category}
    </Link>
  )
}

function PostCard({ post, variant = 'default' }: PostCardProps) {
  return (
    <Link to={`/post/${post.slug}`} className="post-card">
      {variant === 'default' && (
        <div className="post-card__meta">
          <span>{post.date}</span>
          <CategoryChip category={post.category} />
        </div>
      )}
      <h2 className="post-card__title">{post.title}</h2>
      {variant === 'search' ? (
        // 검색 결과: 카테고리·태그를 한 줄로, 그 아래 요약
        <>
          <div className="post-card__meta">
            <CategoryChip category={post.category} />
            <TagList tags={post.tags} />
          </div>
          {post.summary && <p className="post-card__summary">{post.summary}</p>}
        </>
      ) : (
        <>
          {post.summary && <p className="post-card__summary">{post.summary}</p>}
          <TagList tags={post.tags} />
        </>
      )}
    </Link>
  )
}

export default PostCard
