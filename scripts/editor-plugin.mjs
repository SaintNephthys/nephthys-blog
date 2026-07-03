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
 *   GET    /api/deploy/preview       배포 시 공개 상태가 바뀌는 게시물 목록
 *   POST   /api/deploy               git add → commit → push (Actions가 배포)
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import matter from 'gray-matter'
import {
  CONTENT_DIR,
  buildPosts,
  listPostFiles,
  parsePostFile,
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
  if (body.draft === true) data.draft = true
  const md = matter.stringify(String(body.content ?? ''), data)
  fs.mkdirSync(CONTENT_DIR, { recursive: true })
  fs.writeFileSync(postFilePath(slug), md)
  buildPosts()
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
  await git('add', '-A', '--', 'content/posts')

  const status = (await git('status', '--porcelain', '--', 'content/posts')).trim()
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
      return sendJson(res, 200, { ok: true })
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
      // 에디터 밖에서 md 파일을 직접 수정해도 public/posts가 갱신되도록 감시
      server.watcher.add(CONTENT_DIR)
      server.watcher.on('change', (file) => {
        if (file.startsWith(CONTENT_DIR)) buildPosts()
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
