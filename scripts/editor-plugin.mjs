/**
 * 로컬 에디터 API — Vite dev 서버 전용 플러그인.
 *
 * 정적 호스팅(GitHub Pages)에는 존재하지 않는 엔드포인트이므로,
 * 게시물 작성/편집/배포는 저장소가 있는 로컬 환경에서만 가능하다.
 *
 *   GET    /api/posts                게시물 목록 (draft 포함)
 *   GET    /api/posts/:slug          게시물 단건 (frontmatter + 본문)
 *   PUT    /api/posts/:slug          저장 (content/posts/<slug>.md 기록)
 *   DELETE /api/posts/:slug          삭제
 *   GET    /api/categories           카테고리 목록 (categories.json + 게시물 파생, 게시물 수 포함)
 *   POST   /api/categories           카테고리 추가 (content/categories.json 기록)
 *   PUT    /api/categories/:name     카테고리 이름 수정 (사용 중인 게시물 frontmatter도 일괄 갱신)
 *   DELETE /api/categories/:name     카테고리 삭제 (게시물이 사용 중이면 409)
 *   GET    /api/deploy/preview       배포 시 공개 상태가 바뀌는 게시물 목록
 *   POST   /api/deploy               git add → commit → push (Actions가 배포)
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import matter from 'gray-matter'
import {
  CATEGORIES_FILE,
  CONTENT_DIR,
  buildPosts,
  listPostFiles,
  parsePostFile,
  readCategoryNames,
} from './build-posts.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(CONTENT_DIR, '..', '..')
const SLUG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/

async function git(...args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function assertSlug(slug) {
  if (!SLUG_RE.test(slug) || slug.includes('..')) {
    throw Object.assign(new Error(`잘못된 slug: ${slug}`), { status: 400 })
  }
}

function postFilePath(slug) {
  assertSlug(slug)
  return path.join(CONTENT_DIR, `${slug}.md`)
}

// ---- 게시물 CRUD -----------------------------------------------------------

function listAllPosts() {
  return listPostFiles()
    .map((file) => {
      const { content, ...meta } = parsePostFile(file)
      void content
      return meta
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

function savePost(slug, body) {
  const data = {
    title: String(body.title ?? '').trim() || slug,
    date: String(body.date ?? '').slice(0, 10),
    tags: Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [],
    summary: String(body.summary ?? ''),
  }
  const category = String(body.category ?? '').trim()
  if (category) data.category = category
  if (body.draft === true) data.draft = true
  const md = matter.stringify(String(body.content ?? ''), data)
  fs.mkdirSync(CONTENT_DIR, { recursive: true })
  fs.writeFileSync(postFilePath(slug), md)
  buildPosts()
  syncCategories()
}

// ---- 카테고리 ----------------------------------------------------------------
// 게시물이 하나도 없는 카테고리도 유지할 수 있도록 content/categories.json에 저장하고,
// 게시물 frontmatter에서 파생된 카테고리와 병합해 노출한다.

function writeCategoryFile(names) {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ko'))
  fs.writeFileSync(CATEGORIES_FILE, `${JSON.stringify(sorted, null, 2)}\n`)
}

function listCategories() {
  const counts = new Map()
  for (const file of listPostFiles()) {
    const { category } = parsePostFile(file)
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const names = new Set([...readCategoryNames(), ...counts.keys()])
  return [...names]
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((name) => ({ name, count: counts.get(name) ?? 0 }))
}

/** 카테고리 이름 변경: 사용 중인 모든 게시물(draft 포함)의 frontmatter를 함께 갱신 */
function renameCategory(from, to) {
  for (const file of listPostFiles()) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')
    const { data, content } = matter(raw)
    if (data.category !== from) continue
    data.category = to
    // gray-matter는 따옴표 없는 날짜를 Date 객체로 파싱하므로 YYYY-MM-DD 문자열로 되돌린다
    if (data.date instanceof Date) data.date = data.date.toISOString().slice(0, 10)
    fs.writeFileSync(path.join(CONTENT_DIR, file), matter.stringify(content, data))
  }
  writeCategoryFile(readCategoryNames().map((n) => (n === from ? to : n)))
}

/** 게시물에서 파생된 카테고리를 categories.json에 합쳐 파일을 항상 동기화 상태로 유지 */
function syncCategories() {
  const current = readCategoryNames()
  const merged = [...new Set([...current, ...listCategories().map((c) => c.name)])].sort(
    (a, b) => a.localeCompare(b, 'ko'),
  )
  if (JSON.stringify(merged) !== JSON.stringify(current)) writeCategoryFile(merged)
}

// ---- 배포 ------------------------------------------------------------------

async function resolveBaseRef() {
  for (const ref of ['origin/master', 'origin/main', 'HEAD']) {
    try {
      await git('rev-parse', '--verify', '--quiet', ref)
      return ref
    } catch {
      /* 다음 후보 시도 */
    }
  }
  return null
}

async function readPostAtRef(ref, file) {
  try {
    const raw = await git('show', `${ref}:content/posts/${file}`)
    const { data } = matter(raw)
    return { raw, draft: data.draft === true, title: data.title ?? file }
  } catch {
    return null
  }
}

/** 배포 기준(ref) 대비 현재 작업 트리의 게시물 공개 상태 변화를 계산 */
async function deployPreview() {
  const baseRef = await resolveBaseRef()
  const current = new Map(
    listPostFiles().map((file) => [file, parsePostFile(file)]),
  )

  let baseFiles = []
  if (baseRef) {
    try {
      const out = await git('ls-tree', '-r', '--name-only', baseRef, '--', 'content/posts')
      baseFiles = out
        .split('\n')
        .filter(Boolean)
        .map((p) => path.basename(p))
    } catch {
      baseFiles = []
    }
  }

  const files = new Set([...current.keys(), ...baseFiles])
  const result = { publish: [], unpublish: [], update: [], drafts: [] }

  for (const file of files) {
    const next = current.get(file) ?? null
    const prev = baseRef ? await readPostAtRef(baseRef, file) : null
    const title = next?.title ?? prev?.title ?? file
    const wasPublic = prev !== null && !prev.draft
    const isPublic = next !== null && !next.draft

    if (!wasPublic && isPublic) result.publish.push(title)
    else if (wasPublic && !isPublic) result.unpublish.push(title)
    else if (wasPublic && isPublic) {
      const rawNow = fs.readFileSync(postFilePath(file.replace(/\.md$/, '')), 'utf8')
      if (prev.raw !== rawNow) result.update.push(title)
    } else if (next?.draft) result.drafts.push(title)
  }

  const status = (await git('status', '--porcelain', '--', 'content/posts')).trim()
  return { ...result, hasChanges: status.length > 0 }
}

async function deploy(message) {
  const log = []
  buildPosts()
  // categories.json도 게시물과 함께 커밋되도록 content 전체를 스테이징
  await git('add', '-A', '--', 'content')

  const status = (await git('status', '--porcelain', '--', 'content')).trim()
  if (status) {
    await git('commit', '-m', message || `게시물 업데이트 (${new Date().toISOString().slice(0, 10)})`)
    log.push('커밋 완료')
  } else {
    log.push('변경 사항 없음 — 커밋 생략')
  }

  const push = await execFileAsync('git', ['push', 'origin', 'HEAD'], { cwd: ROOT })
  log.push(push.stderr.trim() || push.stdout.trim() || 'push 완료')
  log.push('GitHub Actions가 빌드·배포를 시작합니다.')
  return log
}

// ---- 미들웨어 ---------------------------------------------------------------

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const segments = url.pathname.split('/').filter(Boolean) // ['api', ...]

  if (segments[1] === 'posts') {
    const slug = segments[2] ? decodeURIComponent(segments[2]) : null

    if (req.method === 'GET' && !slug) {
      return sendJson(res, 200, { posts: listAllPosts() })
    }
    if (req.method === 'GET' && slug) {
      const file = postFilePath(slug)
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: '게시물이 없습니다.' })
      return sendJson(res, 200, parsePostFile(`${slug}.md`))
    }
    if (req.method === 'PUT' && slug) {
      savePost(slug, await readBody(req))
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'DELETE' && slug) {
      const file = postFilePath(slug)
      if (fs.existsSync(file)) fs.rmSync(file)
      buildPosts()
      syncCategories()
      return sendJson(res, 200, { ok: true })
    }
  }

  if (segments[1] === 'categories') {
    const name = segments[2] ? decodeURIComponent(segments[2]) : null

    if (req.method === 'GET' && !name) {
      return sendJson(res, 200, { categories: listCategories() })
    }
    if (req.method === 'POST' && !name) {
      const body = await readBody(req)
      const newName = String(body.name ?? '').trim()
      if (!newName) return sendJson(res, 400, { error: '카테고리 이름을 입력하세요.' })
      if (listCategories().some((c) => c.name === newName))
        return sendJson(res, 409, { error: `이미 존재하는 카테고리입니다: ${newName}` })
      writeCategoryFile([...readCategoryNames(), newName])
      buildPosts() // index.json의 categories도 갱신 (사이드바 즉시 반영)
      return sendJson(res, 200, { categories: listCategories() })
    }
    if (req.method === 'PUT' && name) {
      const body = await readBody(req)
      const newName = String(body.name ?? '').trim()
      if (!newName) return sendJson(res, 400, { error: '새 카테고리 이름을 입력하세요.' })
      if (!listCategories().some((c) => c.name === name))
        return sendJson(res, 404, { error: `카테고리가 없습니다: ${name}` })
      if (newName !== name && listCategories().some((c) => c.name === newName))
        return sendJson(res, 409, { error: `이미 존재하는 카테고리입니다: ${newName}` })
      if (newName !== name) {
        renameCategory(name, newName)
        buildPosts()
      }
      return sendJson(res, 200, { categories: listCategories() })
    }
    if (req.method === 'DELETE' && name) {
      const target = listCategories().find((c) => c.name === name)
      if (target && target.count > 0)
        return sendJson(res, 409, {
          error: `게시물 ${target.count}개가 사용 중인 카테고리는 삭제할 수 없습니다.`,
        })
      writeCategoryFile(readCategoryNames().filter((n) => n !== name))
      buildPosts()
      return sendJson(res, 200, { categories: listCategories() })
    }
  }

  if (segments[1] === 'deploy') {
    if (req.method === 'GET' && segments[2] === 'preview') {
      return sendJson(res, 200, await deployPreview())
    }
    if (req.method === 'POST' && !segments[2]) {
      const { message } = await readBody(req)
      return sendJson(res, 200, { log: await deploy(message) })
    }
  }

  return sendJson(res, 404, { error: 'unknown endpoint' })
}

export function editorApiPlugin() {
  return {
    name: 'nephthys-editor-api',
    apply: 'serve',
    configureServer(server) {
      buildPosts()
      syncCategories()
      // 에디터 밖에서 md 파일을 직접 수정해도 public/posts가 갱신되도록 감시
      server.watcher.add(CONTENT_DIR)
      server.watcher.on('change', (file) => {
        if (file.startsWith(CONTENT_DIR)) {
          buildPosts()
          syncCategories()
        }
      })

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        handleRequest(req, res).catch((err) => {
          sendJson(res, err.status ?? 500, { error: err.message })
        })
      })
    },
  }
}
