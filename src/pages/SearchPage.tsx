import { useParams } from 'react-router-dom'
import FilterBar from '../components/post/FilterBar'
import PostList from '../components/post/PostList'
import PageHero from '../components/widgets/PageHero'
import { usePostIndex } from '../lib/usePostIndex'

function SearchPage() {
  const { query = '' } = useParams<{ query: string }>()
  const { posts, loading, error } = usePostIndex()

  // 검색 범위: 태그, 제목, 모든 헤더, `- ` 구분점 텍스트
  const q = query.toLowerCase()
  const results = posts.filter((p) =>
    [p.title, ...p.tags, p.searchText].join('\n').toLowerCase().includes(q),
  )

  return (
    <>
      <PageHero title="SEARCH" subtitle={`"${query}" 검색 결과 ${results.length}건`} />
      <FilterBar initialQuery={query} />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={results} variant="search" />}
    </>
  )
}

export default SearchPage
