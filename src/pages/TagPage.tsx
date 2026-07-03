import { useParams } from 'react-router-dom'
import PostList from '../components/post/PostList'
import { usePostIndex } from '../lib/usePostIndex'

function TagPage() {
  const { tag } = useParams<{ tag: string }>()
  const { posts, loading, error } = usePostIndex()
  const filtered = posts.filter((p) => tag !== undefined && p.tags.includes(tag))

  return (
    <>
      <h1 className="page-title">TAG: {tag}</h1>
      <p className="page-subtitle">게시물 {filtered.length}건</p>
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={filtered} />}
    </>
  )
}

export default TagPage
