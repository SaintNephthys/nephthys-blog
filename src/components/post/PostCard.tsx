import { Link } from 'react-router-dom'
import type { PostMeta } from '../../lib/posts'
import TagList from './TagList'

interface PostCardProps {
  post: PostMeta
}

function PostCard({ post }: PostCardProps) {
  return (
    <Link to={`/post/${post.slug}`} className="post-card">
      <div className="post-card__meta">
        <span>{post.date}</span>
      </div>
      <h2 className="post-card__title">{post.title}</h2>
      {post.summary && <p className="post-card__summary">{post.summary}</p>}
      <TagList tags={post.tags} />
    </Link>
  )
}

export default PostCard
