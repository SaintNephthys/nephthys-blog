import type { PostMeta } from '../../lib/posts'
import PostCard, { type PostCardVariant } from './PostCard'

interface PostListProps {
  posts: PostMeta[]
  variant?: PostCardVariant
}

function PostList({ posts, variant = 'default' }: PostListProps) {
  if (posts.length === 0) {
    return <div className="empty-note">NO DATA</div>
  }
  return (
    <div className="post-list">
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} variant={variant} />
      ))}
    </div>
  )
}

export default PostList
