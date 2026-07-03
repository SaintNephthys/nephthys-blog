import PostList from '../components/post/PostList'
import { usePostIndex } from '../lib/usePostIndex'

function HomePage() {
  const { posts, loading, error } = usePostIndex()

  return (
    <>
      <h1 className="page-title">ARCHIVES</h1>
      <p className="page-subtitle">전체 게시물 {posts.length}건</p>
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={posts} />}
    </>
  )
}

export default HomePage
