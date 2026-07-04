# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nephthys Blog — GitHub Pages(`https://saintnephthys.github.io/nephthys-blog/`)에 호스팅되는 개인 블로그.
React 19 + Vite + TypeScript, NieR:Automata UI 테마(세피아 팔레트). 설계·구현 이력: `docs/implementation-plan.md`.

## Commands

- `npm run dev` — dev 서버 (에디터 API 포함, `/#/editor` 사용 가능)
- `npm run build` — `prebuild`(build-posts) → `tsc -b` → vite build
- `npm run build:posts` — content/posts → public/posts 변환만 실행
- `npm run lint` — ESLint
- `npm run preview` — 프로덕션 빌드 로컬 확인

테스트 프레임워크는 없다. 렌더링 검증이 필요하면 react-dom/server의 `renderToStaticMarkup`으로
MarkdownRenderer와 동일한 플러그인 체인을 node에서 돌려 스모크 테스트한다.

## Architecture

### 콘텐츠 파이프라인
- 게시물 원본: `content/posts/*.md` (frontmatter: `title, date, category, tags, summary, draft`)
- `scripts/build-posts.mjs`가 생성하는 것:
  - `public/posts/index.json` — 메타데이터 + `searchText`(본문의 모든 헤더와 `- ` 구분점 텍스트를 추출, 코드 블럭 제외·인라인 서식 제거)
  - `public/posts/<slug>.md` — 본문 (frontmatter 제거)
  - **`draft: true` 게시물은 산출물에서 제외** — push되어도 공개되지 않는다
- `public/posts/`는 자동 생성물이므로 gitignore됨. dev 서버 시작 시와 md 변경 시 자동 재생성.
- 클라이언트(`src/lib/posts.ts`)는 초기에 index.json만 fetch하고 본문은 열람 시 개별 fetch. 검색도 index.json의 `searchText`만 사용(검색 범위: 태그·제목·헤더·구분점).

### 라우팅 (HashRouter — GitHub Pages 404 회피)
`/`(목록) · `/post/:slug` · `/tags` · `/tag/:tag` · `/category/:category` · `/search/:query` · `/editor`
PostPage/EditorPage는 React.lazy — KaTeX·highlight.js가 초기 번들에 포함되지 않도록 유지할 것.

### Markdown 렌더링
- `MarkdownRenderer`(뷰어·에디터 프리뷰 공용): remark-gfm/math + rehype-raw(밑줄 `<u>` 지원)/katex/highlight/slug
- 코드 블럭은 `CodeBlock` 래퍼 — hover 시 언어명(좌상단)·COPY 버튼(우상단), 색상은 NieR Automata Light 테마(shelune/vscode-nier-automata-light) 매핑
- 게시물 우측 목차(`TableOfContents`)는 **H1(`# `)만 인식** — 글의 최상위 섹션은 `#`으로 작성하는 것이 컨벤션. id는 rehype-slug와 동일한 github-slugger로 생성하므로 두 로직이 항상 같은 규칙을 써야 한다. HashRouter와 충돌하므로 앵커 이동은 URL 해시가 아닌 `scrollIntoView`로 처리.

### 에디터 (로컬 전용)
- `scripts/editor-plugin.mjs` — Vite dev 미들웨어(`apply: 'serve'`): `/api/posts` CRUD, `/api/deploy/preview`(origin/master 대비 공개 상태 변화 계산), `/api/deploy`(git add/commit/push). 배포된 정적 사이트에는 존재하지 않는다.
- `src/pages/EditorPage.tsx` — `import.meta.env.DEV`가 아니면 안내만 표시하므로 프로덕션 번들에서 에디터 로직이 제거된다. 새 글은 draft로 생성되며 PUBLISH 토글로 공개 전환. 배포 다이얼로그가 공개/비공개 상태 변화를 보여준다.
- `MarkdownToolbar` — 텍스트 선택 후 버튼으로 서식 적용(좌측 끝 CLR은 서식 제거). 카테고리는 드롭다운(기존 목록 + "새 카테고리" prompt).

### 테마·타이포그래피
- 스타일은 `src/theme/nier.css` 하나에 CSS 변수(`--nier-*`) 기반으로 모여 있다. 새 UI는 기존 변수·클래스 패턴(패널, 반전 호버)을 재사용할 것.
- **모든 font-size는 rem** — 루트 기본 18px, `FontSizeControl`(사이드바 상단)이 `html.style.fontSize`를 12~22px로 조절하고 localStorage(`nephthys-font-size`)에 저장한다. px로 글씨 크기를 지정하면 이 기능이 깨진다.

### 컴포넌트 설계 원칙 (Three.js 대비)
- 레이아웃 요소(`src/components/layout/` — TopBar, SideTabBar, Background)는 데이터/콜백만 props로 받는 독립 파일로 유지한다. 차후 @react-three/fiber 도입 시 파일 단위로 3D 버전으로 교체하는 것이 전제. `Background`가 R3F Canvas로 바뀌는 첫 지점.
- 에디터처럼 넓은 화면이 필요한 페이지는 AppFrame이 라우트를 보고 `app-content--wide`를 붙인다(기본 본문 폭 980px 제한 해제).

### 배포
- vite `base: '/nephthys-blog/'`. `.github/workflows/deploy.yml`이 master push 시 빌드 후 Pages 배포 (저장소 Settings → Pages → Source가 "GitHub Actions"여야 함).

## Conventions

- 커밋 메시지는 한국어로 작성한다.
- `tsconfig.app.json`은 strict + `noUnusedLocals`/`noUnusedParameters` — 미사용 코드는 빌드 실패.
- ESLint의 `react-hooks/set-state-in-effect` 규칙이 활성 — effect 본문에서 동기 setState 금지 (promise 콜백에서 처리하고, slug 등 키를 함께 저장해 stale 상태를 걸러내는 패턴 사용).
- 게시물 본문의 최상위 섹션 헤더는 `#`(H1) — 목차가 H1만 인식한다.
