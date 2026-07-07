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
 *   POST   /api/images/:slug         이미지 업로드 (?name=원본명, body: 바이너리)
 *                                    → WebP(q80, 최대 폭 1600px) 변환 후 게시물의
 *                                    이미지 디렉터리에 저장 (초안은 gitignore 영역)
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
  DRAFTS_DIR,
  DRAFT_IMAGES_DIR,
  IMAGES_DIR,
  buildPosts,
  listDraftFiles,
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

/** slug에 해당하는 게시(published)/초안(draft) 경로 — draft는 gitignore 디렉터리에 격리 */
function postPaths(slug) {
  assertSlug(slug)
  return {
    published: path.join(CONTENT_DIR, `${slug}.md`),
    draft: path.join(DRAFTS_DIR, `${slug}.md`),
  }
}

/** 두 디렉터리에서 slug를 찾는다. draft 디렉터리가 우선. */
function findPost(slug) {
  const paths = postPaths(slug)
  if (fs.existsSync(paths.draft)) return { file: paths.draft, dir: DRAFTS_DIR, draft: true }
  if (fs.existsSync(paths.published))
    return { file: paths.published, dir: CONTENT_DIR, draft: false }
  return null
}

// ---- 게시물 이미지 -----------------------------------------------------------
// md 파일과 동일한 격리 시맨틱: 공개 글 이미지는 content/images/<slug>/(커밋 대상),
// 초안 이미지는 content/drafts/images/<slug>/(gitignore). PUBLISH 토글이 함께 이동시킨다.

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const IMAGE_MIME = {
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

/** slug의 이미지 디렉터리 쌍 — 호출자가 slug 검증을 마친 상태를 전제한다 */
function imageDirs(slug) {
  return {
    published: path.join(IMAGES_DIR, slug),
    draft: path.join(DRAFT_IMAGES_DIR, slug),
  }
}

/** 이미지 디렉터리를 반대편으로 이동. 대상이 이미 있으면 파일 단위로 병합한다. */
function moveImageDir(from, to) {
  if (!fs.existsSync(from)) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  if (!fs.existsSync(to)) {
    fs.renameSync(from, to)
    return
  }
  for (const file of fs.readdirSync(from)) {
    fs.renameSync(path.join(from, file), path.join(to, file))
  }
  fs.rmSync(from, { recursive: true, force: true })
}

/** 게시물의 공개 상태에 맞춰 이미지 디렉터리 위치를 정렬 */
function alignImageDir(slug, isDraft) {
  const dirs = imageDirs(slug)
  moveImageDir(isDraft ? dirs.published : dirs.draft, isDraft ? dirs.draft : dirs.published)
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('파일이 너무 큽니다 (최대 20MB).'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** 업로드 파일명 정리 — 이름이 없거나 전부 걸러지면(클립보드 붙여넣기) 타임스탬프 이름 */
function sanitizeImageName(name) {
  const base = path.basename(name ?? '').replace(/\.[A-Za-z0-9]+$/, '')
  const clean = base
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣._-]/g, '')
    .replace(/^[.-]+|[.-]+$/g, '')
  return clean || `paste-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
}

/** 같은 이름이 있으면 -2, -3… 서픽스로 회피 */
function uniqueImageName(dir, base, ext) {
  let candidate = `${base}${ext}`
  for (let i = 2; fs.existsSync(path.join(dir, candidate)); i += 1) {
    candidate = `${base}-${i}${ext}`
  }
  return candidate
}

let sharpPromise = null
function loadSharp() {
  // vite.config가 이 모듈을 빌드 시에도 import하므로 sharp(네이티브 모듈)는 지연 로드
  sharpPromise ??= import('sharp').then((m) => m.default)
  return sharpPromise
}

/** 업로드 원본을 게시물의 이미지 디렉터리에 저장. 래스터는 WebP(q80)로 재인코딩. */
async function saveImage(slug, originalName, buffer) {
  const found = findPost(slug)
  if (!found) {
    throw Object.assign(new Error('게시물을 먼저 저장하세요.'), { status: 400 })
  }
  const dir = found.draft ? imageDirs(slug).draft : imageDirs(slug).published
  fs.mkdirSync(dir, { recursive: true })
  const base = sanitizeImageName(originalName)

  // SVG는 벡터 그대로 저장, 그 외 래스터는 WebP 변환(재인코딩 과정에서 EXIF도 제거된다)
  if (/\.svg$/i.test(originalName ?? '')) {
    const file = uniqueImageName(dir, base, '.svg')
    fs.writeFileSync(path.join(dir, file), buffer)
    return file
  }

  const sharp = await loadSharp()
  let webp
  try {
    webp = await sharp(buffer, { animated: /\.gif$/i.test(originalName ?? '') })
      .rotate() // EXIF 회전 정규화
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    throw Object.assign(new Error('이미지 형식을 처리할 수 없습니다.'), { status: 400 })
  }
  const file = uniqueImageName(dir, base, '.webp')
  fs.writeFileSync(path.join(dir, file), webp)
  return file
}

// ---- 게시물 CRUD -----------------------------------------------------------

function listAllPosts() {
  const stripContent = ({ content, ...meta }) => {
    void content
    return meta
  }
  const published = listPostFiles().map((file) => stripContent(parsePostFile(file)))
  const drafts = listDraftFiles().map((file) => ({
    ...stripContent(parsePostFile(file, DRAFTS_DIR)),
    draft: true,
  }))
  return [...published, ...drafts].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
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
  const isDraft = body.draft === true
  if (isDraft) data.draft = true
  const md = matter.stringify(String(body.content ?? ''), data)
  const paths = postPaths(slug)
  const target = isDraft ? paths.draft : paths.published
  const other = isDraft ? paths.published : paths.draft
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, md)
  // 공개 상태가 바뀌면 반대편 디렉터리의 파일을 제거해 "이동" 시맨틱을 유지
  if (fs.existsSync(other)) fs.rmSync(other)
  // 이미지 디렉터리도 md와 같은 편(커밋 대상/격리 영역)에 있도록 이동
  alignImageDir(slug, isDraft)
  buildPosts()
  syncCategories()
}

/** content/posts에 남아 있는 draft: true 파일을 drafts 디렉터리로 이동 (서버 시작 시 1회) */
function relocateDrafts() {
  for (const file of listPostFiles()) {
    if (!parsePostFile(file).draft) continue
    fs.mkdirSync(DRAFTS_DIR, { recursive: true })
    fs.renameSync(path.join(CONTENT_DIR, file), path.join(DRAFTS_DIR, file))
    console.log(`[editor] draft 이동: content/posts/${file} → content/drafts/${file}`)
  }
  // 초안 게시물의 이미지가 커밋 영역(content/images)에 남아 있으면 함께 격리
  // (이동 실패 잔재·수동 파일 배치 등 — md 방어 로직과 대칭)
  for (const file of listDraftFiles()) {
    const slug = file.replace(/\.md$/, '')
    if (!fs.existsSync(imageDirs(slug).published)) continue
    alignImageDir(slug, true)
    console.log(`[editor] draft 이미지 격리: content/images/${slug} → content/drafts/images/${slug}`)
  }
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
  for (const { dir, file } of allPostEntries()) {
    const { category } = parsePostFile(file, dir)
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const names = new Set([...readCategoryNames(), ...counts.keys()])
  return [...names]
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((name) => ({ name, count: counts.get(name) ?? 0 }))
}

/** (dir, file) 쌍 목록 — 게시됨 + 초안 전체 순회용 */
function allPostEntries() {
  return [
    ...listPostFiles().map((file) => ({ dir: CONTENT_DIR, file })),
    ...listDraftFiles().map((file) => ({ dir: DRAFTS_DIR, file })),
  ]
}

/** 카테고리 이름 변경: 사용 중인 모든 게시물(draft 포함)의 frontmatter를 함께 갱신 */
function renameCategory(from, to) {
  for (const { dir, file } of allPostEntries()) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8')
    const { data, content } = matter(raw)
    if (data.category !== from) continue
    data.category = to
    // gray-matter는 따옴표 없는 날짜를 Date 객체로 파싱하므로 YYYY-MM-DD 문자열로 되돌린다
    if (data.date instanceof Date) data.date = data.date.toISOString().slice(0, 10)
    fs.writeFileSync(path.join(dir, file), matter.stringify(content, data))
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
      const rawNow = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')
      if (prev.raw !== rawNow) result.update.push(title)
    } else if (next?.draft) result.drafts.push(title)
  }

  // 초안은 gitignore된 content/drafts/에 있으므로 배포(커밋)에 포함되지 않는다 — 안내용 목록
  for (const file of listDraftFiles()) {
    result.drafts.push(parsePostFile(file, DRAFTS_DIR).title)
  }

  // 이미지·카테고리 변경도 감지하도록 content 전체를 본다 (drafts는 gitignore라 제외됨)
  const status = (await git('status', '--porcelain', '--', 'content')).trim()
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
      const found = findPost(slug)
      if (!found) return sendJson(res, 404, { error: '게시물이 없습니다.' })
      return sendJson(res, 200, {
        ...parsePostFile(`${slug}.md`, found.dir),
        draft: found.draft,
      })
    }
    if (req.method === 'PUT' && slug) {
      savePost(slug, await readBody(req))
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'DELETE' && slug) {
      const found = findPost(slug)
      if (found) fs.rmSync(found.file)
      // 이미지 디렉터리도 함께 삭제해 고아 이미지를 남기지 않는다
      for (const dir of Object.values(imageDirs(slug))) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
      buildPosts()
      syncCategories()
      return sendJson(res, 200, { ok: true })
    }
  }

  if (segments[1] === 'images') {
    const slug = segments[2] ? decodeURIComponent(segments[2]) : null
    if (req.method === 'POST' && slug) {
      assertSlug(slug)
      const name = url.searchParams.get('name') ?? ''
      const buffer = await readRawBody(req, MAX_IMAGE_BYTES)
      if (buffer.length === 0)
        return sendJson(res, 400, { error: '이미지 데이터가 비어 있습니다.' })
      const file = await saveImage(slug, name, buffer)
      return sendJson(res, 200, { file })
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
      relocateDrafts() // content/posts에 남은 draft를 gitignore 디렉터리로 격리
      buildPosts()
      syncCategories()
      // 에디터 밖에서 md 파일을 직접 수정해도 public/posts가 갱신되도록 감시.
      // 저장 한 번에 fs 이벤트가 연달아 오므로 디바운스로 모아 한 번만 재빌드하고,
      // 재빌드 실패가 dev 서버 프로세스를 죽이지 않도록 격리한다.
      server.watcher.add(CONTENT_DIR)
      server.watcher.add(DRAFTS_DIR)
      let rebuildTimer = null
      server.watcher.on('change', (file) => {
        if (!file.startsWith(CONTENT_DIR) && !file.startsWith(DRAFTS_DIR)) return
        clearTimeout(rebuildTimer)
        rebuildTimer = setTimeout(() => {
          try {
            buildPosts()
            syncCategories()
          } catch (err) {
            console.error('[editor] 재빌드 실패:', err.message)
          }
        }, 100)
      })

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        handleRequest(req, res).catch((err) => {
          sendJson(res, err.status ?? 500, { error: err.message })
        })
      })

      // dev 이미지 서빙 — 초안 이미지는 public/에 복사되지 않고, 공개 글도 업로드 직후에는
      // 아직 public/에 없으므로 content에서 직접 제공한다 (vite 정적 서빙보다 먼저 등록됨)
      const base = server.config.base ?? '/'
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || !req.url) return next()
        let pathname
        try {
          pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
        } catch {
          return next()
        }
        // base('/nephthys-blog/') 유무 모두 허용
        const rel = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
        const match = /^\/posts\/images\/([^/]+)\/([^/]+)$/.exec(rel)
        if (!match) return next()
        const [, slug, file] = match
        if (slug.includes('..') || file.includes('..')) return next()
        for (const dir of [path.join(IMAGES_DIR, slug), path.join(DRAFT_IMAGES_DIR, slug)]) {
          const filePath = path.join(dir, file)
          if (fs.existsSync(filePath)) {
            res.statusCode = 200
            res.setHeader(
              'Content-Type',
              IMAGE_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            )
            res.end(fs.readFileSync(filePath))
            return
          }
        }
        return next()
      })
    },
  }
}
