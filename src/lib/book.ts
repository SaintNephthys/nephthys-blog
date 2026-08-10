/**
 * BOOK 카테고리 게시물의 ```book 펜스 단일 원천.
 *
 * 게시물 최상단의 ```book 펜스는 **에디터 전용** 도서 메타(booktitle,
 * bookcategory)다 — 빌드가 index.json의 book 필드로 추출한 뒤 공개 md에서
 * 제거하므로 독자에게는 보이지 않는다. 에디터 프리뷰에서만 도서 배너
 * (BookBanner)로 렌더되고, /books 진열장은 추출된 메타로 진열한다.
 *
 * 펜스 본문 문법: 줄 하나 = `키: 값` (booktitle · bookcategory만 유효, 그 외 무시).
 * 빌드 시 추출·제거 로직(scripts/build-posts.mjs의 extractBookMeta ·
 * stripBookFence)과 문법을 동기 유지할 것.
 */

/** 도서 게시물을 판별하는 게시물 카테고리 이름 */
export const BOOK_CATEGORY = 'BOOK'

export interface BookInfo {
  booktitle: string
  bookcategory: string
}

/** 에디터가 카테고리 BOOK 전환 시 본문 최상단에 삽입하는 기본 템플릿 */
export const BOOK_TEMPLATE = '```book\nbooktitle: \nbookcategory: \n```\n\n'

/** ```book 펜스 본문(펜스 마커 제외)에서 프로퍼티를 파싱한다 */
export function parseBookFence(body: string): BookInfo {
  const info: BookInfo = { booktitle: '', bookcategory: '' }
  for (const line of body.split('\n')) {
    const m = /^(booktitle|bookcategory)\s*:\s*(.*?)\s*$/.exec(line.trim())
    if (m) info[m[1] as keyof BookInfo] = m[2]
  }
  return info
}

/** 본문이 이미 ```book 펜스로 시작하는지 */
export function hasLeadingBookFence(content: string): boolean {
  return /^```book[ \t]*\r?\n/.test(content)
}

/** 카테고리 BOOK 전환 시: 최상단에 템플릿 삽입 (이미 book 펜스로 시작하면 그대로) */
export function withBookTemplate(content: string): string {
  if (hasLeadingBookFence(content)) return content
  return BOOK_TEMPLATE + content
}

/** 프로퍼티가 전부 빈 값인(= 삽입 후 무수정) 최상단 기본 템플릿 매칭 */
const DEFAULT_TEMPLATE_RE =
  /^```book[ \t]*\r?\nbooktitle:[ \t]*\r?\nbookcategory:[ \t]*\r?\n```[ \t]*(?:\r?\n){0,2}/

/**
 * 카테고리를 BOOK에서 다른 값으로 전환 시: 사용자가 수정하지 않은(프로퍼티가
 * 전부 빈) 기본 템플릿만 자동 삭제한다. 값을 채웠다면 본문을 보존한다.
 */
export function withoutDefaultBookTemplate(content: string): string {
  return content.replace(DEFAULT_TEMPLATE_RE, '')
}

/**
 * bookcategory → 썸네일 템플릿 변형(0~4) 결정적 배정.
 * 같은 분류는 항상 같은 변형을 받는다 (문자열 해시 — 순서·개수 무관).
 */
export const BOOK_VARIANTS = 5

export function bookVariant(bookcategory: string): number {
  const s = bookcategory.trim()
  if (!s) return 0
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % BOOK_VARIANTS
}
