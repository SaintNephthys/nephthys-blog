import FilterBar from '../components/post/FilterBar'
import PostList from '../components/post/PostList'
import PageHero from '../components/widgets/PageHero'
import { usePostIndex } from '../lib/usePostIndex'

/** 전체 게시물 목록 (구 홈 화면) — 홈(/)은 랜딩, 목록은 /posts */
function PostsPage() {
  const { posts, loading, error } = usePostIndex()

  return (
    <>
      <PageHero title="ARCHIVES" subtitle={`전체 게시물 ${posts.length}건`} />
      <FilterBar active="ALL" />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && <PostList posts={posts} />}
    </>
  )
}

export default PostsPage
