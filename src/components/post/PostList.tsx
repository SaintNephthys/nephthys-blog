import type { PostMeta } from '../../lib/posts'
import PostCard from './PostCard'

interface PostListProps {
  posts: PostMeta[]
}

function PostList({ posts }: PostListProps) {
  if (posts.length === 0) {
    return <div className="empty-note">NO DATA</div>
  }
  return (
    <div className="post-list">
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} />
      ))}
    </div>
  )
}

export default PostList
