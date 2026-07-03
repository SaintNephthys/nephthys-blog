import { useParams } from 'react-router-dom'
import PostList from '../components/post/PostList'
import { usePostIndex } from '../lib/usePostIndex'

function SearchPage() {
  const { query = '' } = useParams<{ query: string }>()
  const { posts, loading, error } = usePostIndex()

  const q = query.toLowerCase()
  const results = posts.filter((p) =>
    [p.title, p.summary, p.category, ...p.tags]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )

  return (
    <>
      <h1 className="page-title">SEARCH</h1>
      <p className="page-subtitle">
        "{query}" 검색 결과 {results.length}건
      </p>
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={results} variant="search" />}
    </>
  )
}

export default SearchPage
