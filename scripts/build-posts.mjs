/**
 * content/posts/*.md → public/posts/ 변환 스크립트.
 *
 * - frontmatter(title, date, tags, summary, draft)를 파싱해
 *   public/posts/index.json (게시물 메타데이터, 날짜 역순)을 생성한다.
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
const OUT_DIR = path.join(ROOT, 'public', 'posts')

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
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    summary: data.summary ?? '',
    draft: data.draft === true,
    content,
  }
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
      tags: post.tags,
      summary: post.summary,
    })
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  fs.writeFileSync(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify({ posts }, null, 2),
  )

  return { published: posts.length, drafts }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { published, drafts } = buildPosts()
  console.log(`[build-posts] published: ${published}, drafts excluded: ${drafts}`)
}
