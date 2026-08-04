import { Link } from 'react-router-dom'
import PostList from '../components/post/PostList'
import PageHero from '../components/widgets/PageHero'
import { usePostIndex } from '../lib/usePostIndex'

/** 홈 랜딩 — 워드마크 히어로 + 최신 글 미리보기. 전체 목록·필터는 /posts(POST 메뉴) */
function HomePage() {
  const { posts, loading, error } = usePostIndex()
  const latest = posts.slice(0, 4)

  return (
    <>
      <PageHero title="NEPHTHYS BLOG" />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && (
        <section className="home-latest">
          <h2 className="home-latest__title">LATEST POSTS</h2>
          <PostList posts={latest} />
          <div className="home-more">
            <Link className="btn" to="/posts">
              ALL POSTS →
            </Link>
          </div>
        </section>
      )}
    </>
  )
}

export default HomePage
