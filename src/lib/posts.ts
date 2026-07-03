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

const BASE = import.meta.env.BASE_URL

let indexCache: PostMeta[] | null = null

export async function fetchPostIndex(): Promise<PostMeta[]> {
  if (indexCache) return indexCache
  const res = await fetch(`${BASE}posts/index.json`)
  if (!res.ok) throw new Error(`게시물 목록을 불러오지 못했습니다 (${res.status})`)
  const data = (await res.json()) as { posts: PostMeta[] }
  indexCache = data.posts
  return data.posts
}

export async function fetchPostContent(slug: string): Promise<string> {
  const res = await fetch(`${BASE}posts/${encodeURIComponent(slug)}.md`)
  if (!res.ok) throw new Error(`게시물을 불러오지 못했습니다 (${res.status})`)
  return res.text()
}

export function collectCategories(posts: PostMeta[]): Map<string, number> {
  const categories = new Map<string, number>()
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
