import { bookVariant, parseBookFence } from '../../lib/book'

interface BookCoverProps {
  title: string
  category: string
}

/**
 * 고정 도서 썸네일 템플릿 — 마도서(그리무어) 장정. bookcategory가 장정
 * 변형색(--book-v0~v4)을 결정한다. 구조: 가죽/유리 표지 + 등쪽 제본(spine) +
 * 장식 프레임(frame) + 중앙 인장(sigil) + 제목판(plate).
 * CITYRUIN은 눌러 새긴 세공 + 마름모 인장, TOKYOSKY는 별빛 유리 장정 +
 * 원형 마법진으로 tokyosky.css가 오버라이드한다.
 */
export function BookCover({ title, category }: BookCoverProps) {
  return (
    <span className={`book-cover book-cover--v${bookVariant(category)}`}>
      <span className="book-cover__spine" aria-hidden="true" />
      <span className="book-cover__frame" aria-hidden="true" />
      <span className="book-cover__sigil" aria-hidden="true" />
      <span className="book-cover__plate">
        <span className="book-cover__title">{title || '(제목 없음)'}</span>
        {category && <span className="book-cover__cat">{category}</span>}
      </span>
    </span>
  )
}

/**
 * 본문 최상단 ```book 펜스의 렌더 — 썸네일 + 도서 정보 배너.
 * 펜스는 에디터 전용(공개 md에서는 빌드가 제거)이라 이 배너는 에디터
 * 프리뷰·라이브 편집에서만 나타난다. spec은 펜스 본문(`booktitle: …` 줄들)이다.
 */
function BookBanner({ spec }: { spec: string }) {
  const { booktitle, bookcategory } = parseBookFence(spec)
  return (
    <div className={`book-banner book-banner--v${bookVariant(bookcategory)}`}>
      <BookCover title={booktitle} category={bookcategory} />
      <div className="book-banner__info">
        <span className="book-banner__label">READING LOG</span>
        <strong className="book-banner__title">{booktitle || '(제목 없음)'}</strong>
        {bookcategory && <span className="book-banner__cat">{bookcategory}</span>}
      </div>
    </div>
  )
}

export default BookBanner
