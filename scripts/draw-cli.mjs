/**
 * 도형 이미지(DrawDoc) CLI — 에이전트/MCP용 진입점.
 *
 * 에디터 모달(DrawComposer)과 같은 순수 계층(src/lib/draw)을 rolldown으로 즉석
 * 번들해 쓰므로 스키마·직렬화의 단일 원천이 유지된다. 게시물의 이미지 디렉터리
 * (공개: content/images/<slug>/, 초안: content/drafts/images/<slug>/)에 직접
 * 읽고 쓴다 — dev 서버 불필요.
 *
 * 사용법:
 *   node scripts/draw-cli.mjs schema                       스키마·팔레트 레퍼런스
 *   node scripts/draw-cli.mjs list <slug>                  도형 svg 목록(편집 가능 여부)
 *   node scripts/draw-cli.mjs extract <slug> <name.svg>    svg → DrawDoc JSON(stdout)
 *   node scripts/draw-cli.mjs render <slug> <name.svg> [json파일]
 *                                                          DrawDoc JSON → svg 저장
 *                                                          (json파일 생략 시 stdin)
 *
 * render 후 게시물 본문에 ![](name.svg)로 참조해야 한다(미참조 이미지는 게시물
 * 저장 시 자동 정리됨). 바인딩된 선(boundStart/boundEnd)의 끝점 좌표는 render가
 * reflowBindings로 재계산하므로 대략값(예: 0)이어도 된다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTENT_DIR, DRAFTS_DIR, DRAFT_IMAGES_DIR, IMAGES_DIR } from './build-posts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SLUG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/
const NAME_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*\.svg$/

/** src/lib/draw를 번들해 로드 — TS 원본이 단일 원천 */
async function loadDrawLib() {
  const { rolldown } = await import('rolldown')
  const bundle = await rolldown({
    input: path.join(ROOT, 'src/lib/draw/index.ts'),
    logLevel: 'silent',
  })
  const { output } = await bundle.generate({ format: 'esm' })
  await bundle.close()
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(output[0].code)}`)
}

function fail(msg) {
  console.error(`오류: ${msg}`)
  process.exit(1)
}

/** slug의 이미지 디렉터리 (게시물의 공개/초안 상태 판별) — 게시물이 없으면 종료 */
function imageDirOf(slug) {
  if (!SLUG_RE.test(slug) || slug.includes('..')) fail(`잘못된 slug: ${slug}`)
  if (fs.existsSync(path.join(CONTENT_DIR, `${slug}.md`))) return path.join(IMAGES_DIR, slug)
  if (fs.existsSync(path.join(DRAFTS_DIR, `${slug}.md`)))
    return path.join(DRAFT_IMAGES_DIR, slug)
  return fail(`게시물이 없습니다: ${slug} (content/posts 또는 content/drafts에 md가 있어야 함)`)
}

function assertName(name) {
  if (!NAME_RE.test(name) || name.includes('..')) fail(`잘못된 파일명: ${name} (예: diagram.svg)`)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const [, , command, slug, name, jsonPath] = process.argv

switch (command) {
  case 'schema': {
    const lib = await loadDrawLib()
    const roles = lib.ROLES.map(
      (r) => `  ${r.key.padEnd(7)} ${r.name.padEnd(8)} stroke ${r.stroke}  fill ${r.fill}`,
    ).join('\n')
    console.log(`DrawDoc 스키마 (version ${lib.DRAW_DOC_VERSION}) — 도형 기반 SVG 다이어그램 문서

문서: { "version": 1, "width": 960, "height": 540, "shapes": [...] }
  - 캔버스는 편집 좌표계일 뿐, 내보내기는 내용 bbox로 fit된다(pad 16).
  - 에디터는 24px 격자에 스냅하므로 좌표·크기를 24의 배수로 두면 손편집과 어울린다.

도형 공통 필드: id(문서 내 유일), role(아래 팔레트), strokeWidth(1|2|3), dashed(boolean)
  rect    { kind, x, y, w, h, text?, textSize? } 모서리 둥근 사각형, text는 중앙 라벨(\\n 다중 줄, 크기 기본 16)
  ellipse { kind, x, y, w, h, text?, textSize? } bbox 기준 타원
  line    { kind, x1, y1, x2, y2, arrow, boundStart?, boundEnd? }
                                                 arrow=true면 끝점 화살촉.
                                                 boundStart/boundEnd에 rect·ellipse id를 주면
                                                 끝점이 그 도형 경계(+4px)에 자동 정착·추적된다
                                                 — 바인딩 시 좌표는 대략값(0)이어도 됨.
  text    { kind, x, y, text, size }             (x,y)=첫 줄 베이스라인 좌측, size 기본 16

텍스트 스타일(rect·ellipse 라벨과 text 도형의 선택 필드, 생략 = 기본):
  bold: true    굵게 (제목·강조 라벨)
  italic: true  기울임
  mono: true    코드체(IBM Plex Mono) — dynamic_cast<Dog*> 같은 식별자·코드 조각에 사용
  권장 크기: 13(보조 캡션·화살표 라벨) · 16(기본) · 20(제목)

팔레트 role (색은 직접 지정하지 않는다 — NieR 테마 일관성):
${roles}
  용례: alert=주 개체(Eden/Young류), teal=보조 개체, dark=큰 배경 개체(Old류),
        orange=경고·특수(Humongous류), olive=양호·진행, free=중립·비활성(점선과 조합),
        danger=위험 강조(반전 라벨), note=참고 패널, plain=윤곽·텍스트 기본

예시 (A→B 화살표):
{ "version": 1, "width": 960, "height": 540, "shapes": [
  { "kind": "rect", "id": "a", "role": "alert", "strokeWidth": 2, "dashed": false,
    "x": 72, "y": 72, "w": 168, "h": 72, "text": "Eden" },
  { "kind": "rect", "id": "b", "role": "teal", "strokeWidth": 2, "dashed": false,
    "x": 432, "y": 72, "w": 168, "h": 72, "text": "Survivor" },
  { "kind": "line", "id": "l", "role": "plain", "strokeWidth": 2, "dashed": false,
    "x1": 0, "y1": 0, "x2": 0, "y2": 0, "arrow": true, "boundStart": "a", "boundEnd": "b" }
] }

렌더 후에는 게시물 본문에 ![](파일명.svg)를 넣어야 참조가 유지된다.`)
    break
  }

  case 'list': {
    if (!slug) fail('사용법: list <slug>')
    const dir = imageDirOf(slug)
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.svg'))
      : []
    if (files.length === 0) {
      console.log('(도형 svg 없음)')
      break
    }
    const lib = await loadDrawLib()
    for (const f of files.sort()) {
      const doc = lib.svgToDoc(fs.readFileSync(path.join(dir, f), 'utf8'))
      console.log(`${f}\t${doc ? `도형 ${doc.shapes.length}개 (편집 가능)` : '(메타데이터 없음 — 외부 svg)'}`)
    }
    break
  }

  case 'extract': {
    if (!slug || !name) fail('사용법: extract <slug> <name.svg>')
    assertName(name)
    const file = path.join(imageDirOf(slug), name)
    if (!fs.existsSync(file)) fail(`파일이 없습니다: ${path.relative(ROOT, file)}`)
    const lib = await loadDrawLib()
    const doc = lib.svgToDoc(fs.readFileSync(file, 'utf8'))
    if (!doc) fail('도형 문서 메타데이터가 없는 SVG입니다 (이 CLI로 만든 파일이 아님)')
    console.log(JSON.stringify(doc, null, 2))
    break
  }

  case 'render': {
    if (!slug || !name) fail('사용법: render <slug> <name.svg> [json파일] (생략 시 stdin)')
    assertName(name)
    const dir = imageDirOf(slug)
    const raw = jsonPath && jsonPath !== '-' ? fs.readFileSync(jsonPath, 'utf8') : await readStdin()
    let value
    try {
      value = JSON.parse(raw)
    } catch (err) {
      fail(`JSON 파싱 실패: ${err.message}`)
    }
    const lib = await loadDrawLib()
    const errors = lib.docErrors(value)
    if (errors.length > 0) fail(`문서 검증 실패:\n  - ${errors.join('\n  - ')}`)
    const doc = lib.reflowBindings(lib.docFromJson(value))
    const file = path.join(dir, name)
    const existed = fs.existsSync(file)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, lib.docToSvg(doc))
    console.log(
      `${existed ? '덮어씀' : '저장'}: ${path.relative(ROOT, file)} (도형 ${doc.shapes.length}개)`,
    )
    if (!existed) console.log(`게시물 본문에 ![](${name}) 참조를 추가하세요.`)
    break
  }

  default:
    fail('사용법: node scripts/draw-cli.mjs schema | list <slug> | extract <slug> <name.svg> | render <slug> <name.svg> [json파일]')
}
