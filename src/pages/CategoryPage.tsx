import { useParams } from 'react-router-dom'
import FilterBar from '../components/post/FilterBar'
import PostList from '../components/post/PostList'
import PageHero from '../components/widgets/PageHero'
import { usePostIndex } from '../lib/usePostIndex'

function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const { posts, loading, error } = usePostIndex()
  const filtered = posts.filter((p) => p.category === category)

  return (
    <>
      <PageHero title={`CATEGORY: ${category}`} subtitle={`게시물 ${filtered.length}건`} />
      <FilterBar active={category} />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={filtered} />}
    </>
  )
}

export default CategoryPage
