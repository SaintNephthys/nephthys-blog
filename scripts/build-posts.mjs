/**
 * content/posts/*.md → public/posts/ 변환 스크립트.
 *
 * - frontmatter(title, date, tags, summary, draft)를 파싱해
 *   public/posts/index.json (게시물 메타데이터, 날짜 역순)을 생성한다.
 * - content/categories.json + 게시물 파생 카테고리를 병합한 categories 배열도
 *   index.json에 포함한다 → 게시물이 0개인 카테고리도 사이드바에 노출된다.
 * - 본문(frontmatter 제거)을 public/posts/<slug>.md 로 복사한다.
 * - draft 게시물은 content/drafts/(gitignore)에 저장되어 저장소에 올라가지 않는다.
 *   content/posts/에 draft: true 파일이 남아 있어도 산출물에서는 방어적으로 제외된다.
 *
 * 실행: node scripts/build-posts.mjs (빌드 prebuild / dev 플러그인에서 호출)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONTENT_DIR = path.join(ROOT, 'content', 'posts')
// draft 게시물 저장소 — gitignore되어 어떤 커밋 경로로도 저장소에 올라가지 않는다
export const DRAFTS_DIR = path.join(ROOT, 'content', 'drafts')
export const CATEGORIES_FILE = path.join(ROOT, 'content', 'categories.json')
// 게시물별 이미지: 공개 글은 content/images/<slug>/(커밋 대상),
// 초안은 content/drafts/images/<slug>/(drafts 전체가 gitignore라 함께 격리)
export const IMAGES_DIR = path.join(ROOT, 'content', 'images')
export const DRAFT_IMAGES_DIR = path.join(ROOT, 'content', 'drafts', 'images')
const OUT_DIR = path.join(ROOT, 'public', 'posts')

export function readCategoryNames() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

export function parsePostFile(file, dir = CONTENT_DIR) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8')
  const { data, content } = matter(raw)
  const slug = file.replace(/\.md$/, '')
  return {
    slug,
    title: data.title ?? slug,
    date: normalizeDate(data.date),
    category: typeof data.category === 'string' ? data.category : '',
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    summary: data.summary ?? '',
    draft: data.draft === true,
    content,
  }
}

/**
 * 검색용 텍스트 추출: 모든 헤더(#~######)와 `- ` 구분점의 텍스트.
 * 코드 블럭 내부는 제외하고, 인라인 Markdown 문법은 벗겨낸다.
 */
function extractSearchText(content) {
  const lines = []
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    const bullet = /^\s*-\s+(.+?)\s*$/.exec(line)
    const text = heading?.[1] ?? bullet?.[1]
    if (text) {
      lines.push(
        text
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 표시 텍스트
          .replace(/[*_`~]|<\/?u>/g, ''), // 인라인 서식 제거
      )
    }
  }
  return lines.join('\n')
}

export function listPostFiles() {
  if (!fs.existsSync(CONTENT_DIR)) return []
  return fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))
}

export function listDraftFiles() {
  if (!fs.existsSync(DRAFTS_DIR)) return []
  return fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.md'))
}

export function buildPosts() {
  // maxRetries: 직전 빌드가 막 쓴 디렉터리를 지울 때 발생하는 일시적 ENOTEMPTY(macOS) 회피
  fs.rmSync(OUT_DIR, { recursive: true, force: true, maxRetries: 3 })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const posts = []
  let drafts = 0

  for (const file of listPostFiles()) {
    const post = parsePostFile(file)
    if (post.draft) {
      drafts += 1
      continue
    }
    fs.writeFileSync(path.join(OUT_DIR, `${post.slug}.md`), post.content)
    posts.push({
      slug: post.slug,
      title: post.title,
      date: post.date,
      category: post.category,
      tags: post.tags,
      summary: post.summary,
      searchText: extractSearchText(post.content),
    })
  }

  // 공개 게시물의 이미지만 산출물로 복사 — 초안 이미지(content/drafts/images)는
  // 어떤 환경에서도 public/에 들어가지 않는다 (dev 프리뷰는 에디터 플러그인이 직접 서빙)
  if (fs.existsSync(IMAGES_DIR)) {
    const publishedSlugs = new Set(posts.map((p) => p.slug))
    for (const slug of fs.readdirSync(IMAGES_DIR)) {
      const src = path.join(IMAGES_DIR, slug)
      if (!fs.statSync(src).isDirectory()) continue
      if (!publishedSlugs.has(slug)) {
        console.warn(`[build-posts] 공개 게시물이 없는 이미지 디렉터리 제외: content/images/${slug}`)
        continue
      }
      fs.cpSync(src, path.join(OUT_DIR, 'images', slug), { recursive: true })
    }
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const categories = [
    ...new Set([...readCategoryNames(), ...posts.map((p) => p.category).filter(Boolean)]),
  ].sort((a, b) => a.localeCompare(b, 'ko'))
  fs.writeFileSync(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify({ posts, categories }, null, 2),
  )

  return { published: posts.length, drafts }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { published, drafts } = buildPosts()
  console.log(`[build-posts] published: ${published}, drafts excluded: ${drafts}`)
}
