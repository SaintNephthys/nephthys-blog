/**
 * content/posts/*.md → public/posts/ 변환 스크립트.
 *
 * - frontmatter(title, date, tags, summary, draft)를 파싱해
 *   public/posts/index.json (게시물 메타데이터, 날짜 역순)을 생성한다.
 * - content/categories.json + 게시물 파생 카테고리를 병합한 categories 배열도
 *   index.json에 포함한다 → 게시물이 0개인 카테고리도 사이드바에 노출된다.
 * - 본문(frontmatter 제거)을 public/posts/<slug>.md 로 복사한다.
 * - draft: true 게시물은 index.json과 public/posts에서 제외된다.
 *   → 미완성 글이 push되어도 배포된 블로그에는 노출되지 않는다.
 *
 * 실행: node scripts/build-posts.mjs (빌드 prebuild / dev 플러그인에서 호출)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONTENT_DIR = path.join(ROOT, 'content', 'posts')
export const CATEGORIES_FILE = path.join(ROOT, 'content', 'categories.json')
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

export function parsePostFile(file) {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')
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

export function buildPosts() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
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
