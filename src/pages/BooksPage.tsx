import { Link } from 'react-router-dom'
import { BookCover } from '../components/post/BookCard'
import PageHero from '../components/widgets/PageHero'
import { BOOK_CATEGORY } from '../lib/book'
import { usePostIndex } from '../lib/usePostIndex'

/**
 * BOOK 진열장 — 카테고리가 BOOK인 게시물을 도서 썸네일 템플릿으로 진열한다.
 * 도서 메타는 빌드 시 index.json의 book 필드로 추출되어 본문 fetch가 필요 없다.
 * booktitle이 비어 있으면 게시물 제목으로 대체한다.
 */
function BooksPage() {
  const { posts, loading, error } = usePostIndex()
  const books = posts.filter((p) => p.category === BOOK_CATEGORY)

  return (
    <>
      <PageHero title="BOOK" subtitle={`읽은 책 ${books.length}권`} />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && books.length === 0 && (
        <div className="empty-note">아직 진열된 책이 없습니다.</div>
      )}
      {!loading && !error && books.length > 0 && (
        <div className="bookshelf">
          {books.map((post) => (
            <Link key={post.slug} to={`/post/${post.slug}`} className="book-slot">
              <BookCover
                title={post.book?.title || post.title}
                category={post.book?.category ?? ''}
              />
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

export default BooksPage
