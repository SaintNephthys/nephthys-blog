# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nephthys Blog — GitHub Pages(`https://saintnephthys.github.io/nephthys-blog/`)에 호스팅되는 개인 블로그.
React 19 + Vite + TypeScript, NieR:Automata UI 테마(세피아 팔레트). 설계 문서: `docs/implementation-plan.md`.

## Commands

- `npm run dev` — dev 서버 (에디터 API 포함, `/#/editor` 사용 가능)
- `npm run build` — `prebuild`(build-posts) → `tsc -b` → vite build
- `npm run build:posts` — content/posts → public/posts 변환만 실행
- `npm run lint` — ESLint
- `npm run preview` — 프로덕션 빌드 로컬 확인

테스트 프레임워크는 없다.

## Architecture

### 콘텐츠 파이프라인
- 게시물 원본: `content/posts/*.md` (frontmatter: title, date, tags, summary, draft)
- `scripts/build-posts.mjs`가 `public/posts/index.json`(메타데이터)과 `public/posts/<slug>.md`(본문, frontmatter 제거)를 생성. **`draft: true` 게시물은 산출물에서 제외**되어 push되어도 공개되지 않는다.
- `public/posts/`는 자동 생성물이므로 gitignore됨. dev 서버 시작 시와 md 변경 시 자동 재생성.
- 클라이언트는 초기에 index.json만 fetch하고, 게시물 본문은 열람 시 개별 fetch (`src/lib/posts.ts`).

### 에디터 (로컬 전용)
- `scripts/editor-plugin.mjs` — Vite dev 서버 미들웨어(`apply: 'serve'`)로 `/api/posts` CRUD, `/api/deploy/preview`(origin/master 대비 공개 상태 변화 계산), `/api/deploy`(git add/commit/push) 제공. 배포된 정적 사이트에는 존재하지 않는다.
- `src/pages/EditorPage.tsx` — `import.meta.env.DEV`가 아니면 안내만 표시하므로 프로덕션 번들에서 에디터 로직이 제거된다.

### 라우팅·배포
- HashRouter 사용 (GitHub Pages 404 회피). vite `base: '/nephthys-blog/'`.
- `.github/workflows/deploy.yml`이 master push 시 빌드 후 Pages 배포 (Pages Source는 "GitHub Actions"로 설정되어 있어야 함).
- PostPage/EditorPage는 React.lazy — KaTeX·highlight.js가 초기 번들에 포함되지 않도록 유지할 것.

### 컴포넌트 설계 원칙 (Three.js 대비)
- 레이아웃 요소(`src/components/layout/` — TopBar, SideTabBar, Background)는 데이터/콜백만 props로 받는 독립 파일로 유지한다. 차후 @react-three/fiber 도입 시 파일 단위로 3D 버전으로 교체하는 것이 전제. `Background`가 R3F Canvas로 바뀌는 첫 지점.
- 스타일은 `src/theme/nier.css` 하나에 CSS 변수(`--nier-*`) 기반으로 모여 있다. 새 UI는 기존 변수·클래스 패턴(패널, 반전 호버)을 재사용할 것.
- `MarkdownRenderer`는 게시물 뷰어와 에디터 프리뷰가 공용으로 사용한다.

## Conventions

- 커밋 메시지는 한국어로 작성한다.
- `tsconfig.app.json`은 strict + `noUnusedLocals`/`noUnusedParameters` — 미사용 코드는 빌드 실패.
- ESLint의 `react-hooks/set-state-in-effect` 규칙이 활성 — effect 본문에서 동기 setState 금지 (promise 콜백에서 처리).
