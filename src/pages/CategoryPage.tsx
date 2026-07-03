import { useParams } from 'react-router-dom'
import PostList from '../components/post/PostList'
import { usePostIndex } from '../lib/usePostIndex'

function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const { posts, loading, error } = usePostIndex()
  const filtered = posts.filter((p) => p.category === category)

  return (
    <>
      <h1 className="page-title">CATEGORY: {category}</h1>
      <p className="page-subtitle">게시물 {filtered.length}건</p>
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={filtered} />}
    </>
  )
}

export default CategoryPage
