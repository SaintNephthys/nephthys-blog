import { useParams } from 'react-router-dom'
import FilterBar from '../components/post/FilterBar'
import PostList from '../components/post/PostList'
import PageHero from '../components/widgets/PageHero'
import { usePostIndex } from '../lib/usePostIndex'

function TagPage() {
  const { tag } = useParams<{ tag: string }>()
  const { posts, loading, error } = usePostIndex()
  const filtered = posts.filter((p) => tag !== undefined && p.tags.includes(tag))

  return (
    <>
      <PageHero title={`TAG: ${tag}`} subtitle={`게시물 ${filtered.length}건`} />
      <FilterBar />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={filtered} />}
    </>
  )
}

export default TagPage
