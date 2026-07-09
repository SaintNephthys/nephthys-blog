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
    >
      ▣ {category}
    </Link>
  )
}

function PostCard({ post, variant = 'default' }: PostCardProps) {
  return (
    // 중첩 <a>는 HTML 명세 위반(파서가 카드를 쪼갬) — 카드는 div로 두고,
    // 제목 링크의 ::after 오버레이가 카드 전체 클릭을 담당한다(오버레이 링크 패턴).
    // 칩 링크들은 z-index로 오버레이 위에 떠서 hover·클릭이 독립 동작한다.
    <div className="post-card">
      {variant === 'default' && (
        <div className="post-card__meta">
          <span>{post.date}</span>
          <CategoryChip category={post.category} />
        </div>
      )}
      <h2 className="post-card__title">
        <Link to={`/post/${post.slug}`} className="post-card__link">
          {post.title}
        </Link>
      </h2>
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
    </div>
  )
}

export default PostCard
