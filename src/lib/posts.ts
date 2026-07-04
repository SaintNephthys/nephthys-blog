export interface PostMeta {
  slug: string
  title: string
  date: string
  category: string
  tags: string[]
  summary: string
  /** 검색용: 본문의 모든 헤더와 `- ` 구분점 텍스트 (빌드 시 추출) */
  searchText: string
}

export interface PostIndex {
  posts: PostMeta[]
  /** 전체 카테고리 이름 목록 (게시물이 0개인 카테고리 포함, 빌드 시 categories.json과 병합) */
  categories: string[]
}

const BASE = import.meta.env.BASE_URL

let indexCache: PostIndex | null = null
const indexListeners = new Set<() => void>()

/**
 * index.json 캐시를 비우고 구독자(usePostIndex)에게 재조회를 알린다.
 * 로컬 에디터에서 게시물/카테고리를 변경했을 때 사이드바 등이 새로고침 없이 갱신되도록 한다.
 */
export function invalidatePostIndex(): void {
  indexCache = null
  indexListeners.forEach((listener) => listener())
}

export function subscribePostIndex(listener: () => void): () => void {
  indexListeners.add(listener)
  return () => {
    indexListeners.delete(listener)
  }
}

export async function fetchPostIndex(): Promise<PostIndex> {
  if (indexCache) return indexCache
  const res = await fetch(`${BASE}posts/index.json`)
  if (!res.ok) throw new Error(`게시물 목록을 불러오지 못했습니다 (${res.status})`)
  const data = (await res.json()) as { posts: PostMeta[]; categories?: string[] }
  const index: PostIndex = { posts: data.posts, categories: data.categories ?? [] }
  indexCache = index
  return index
}

export async function fetchPostContent(slug: string): Promise<string> {
  const res = await fetch(`${BASE}posts/${encodeURIComponent(slug)}.md`)
  if (!res.ok) throw new Error(`게시물을 불러오지 못했습니다 (${res.status})`)
  return res.text()
}

export function collectCategories(
  posts: PostMeta[],
  allNames: string[] = [],
): Map<string, number> {
  // 게시물이 없는 카테고리도 0개로 노출되도록 전체 이름 목록으로 먼저 채운다
  const categories = new Map<string, number>(allNames.map((name) => [name, 0]))
  for (const post of posts) {
    if (!post.category) continue
    categories.set(post.category, (categories.get(post.category) ?? 0) + 1)
  }
  return new Map(
    [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko')),
  )
}

export function collectTags(posts: PostMeta[]): Map<string, number> {
  const tags = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.tags) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1)
    }
  }
  return new Map([...tags.entries()].sort((a, b) => b[1] - a[1]))
}
