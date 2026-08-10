import { Link } from 'react-router-dom'
import BookShelf from '../components/post/BookShelf'
import PostList from '../components/post/PostList'
import PageHero from '../components/widgets/PageHero'
import { BOOK_CATEGORY } from '../lib/book'
import { usePostIndex } from '../lib/usePostIndex'

/** 홈 랜딩 — 워드마크 히어로 + 최신 글 미리보기 + 하단 미니 도서 진열장.
    전체 목록·필터는 /posts(POST 메뉴), 전체 진열장은 /books(BOOK 메뉴) */
function HomePage() {
  const { posts, loading, error } = usePostIndex()
  // BOOK 게시물(독서 기록)은 최신 글 미리보기에서 제외 — 하단 진열장에 따로 진열
  const latest = posts.filter((p) => p.category !== BOOK_CATEGORY).slice(0, 4)
  const books = posts.filter((p) => p.category === BOOK_CATEGORY).slice(0, 6)

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
      {!loading && !error && books.length > 0 && (
        <section className="home-books">
          <h2 className="home-latest__title">BOOK SHELF</h2>
          <BookShelf books={books} mini />
          <div className="home-more">
            <Link className="btn" to="/books">
              ALL BOOKS →
            </Link>
          </div>
        </section>
      )}
    </>
  )
}

export default HomePage
