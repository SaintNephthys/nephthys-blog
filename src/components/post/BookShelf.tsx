import { Link } from 'react-router-dom'
import { BookCover } from './BookCard'
import type { PostMeta } from '../../lib/posts'

interface BookShelfProps {
  books: PostMeta[]
  /** 홈 하단용 축소 진열장 — 커버·행 높이를 줄인다 (.bookshelf--mini) */
  mini?: boolean
}

/**
 * 도서 진열장 — BOOK 게시물을 마도서 썸네일로 진열하고 클릭 시 게시물로 이동.
 * /books(BooksPage)와 홈 하단 미니 진열장이 공용으로 사용한다.
 * booktitle이 비어 있으면 게시물 제목으로 대체한다.
 */
function BookShelf({ books, mini }: BookShelfProps) {
  return (
    <div className={`bookshelf${mini ? ' bookshelf--mini' : ''}`}>
      {books.map((post) => (
        <Link key={post.slug} to={`/post/${post.slug}`} className="book-slot">
          <BookCover
            title={post.book?.title || post.title}
            category={post.book?.category ?? ''}
          />
        </Link>
      ))}
    </div>
  )
}

export default BookShelf
