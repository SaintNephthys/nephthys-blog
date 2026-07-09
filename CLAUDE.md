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
- **draft 게시물은 `content/drafts/*.md`에 저장** — gitignore되어 저장소에 아예 올라가지 않는다. 에디터의 PUBLISH 토글이 두 디렉터리 간 파일을 이동시키며, dev 서버 시작 시 `content/posts/`에 남은 `draft: true` 파일을 자동으로 `content/drafts/`로 격리한다.
- `scripts/build-posts.mjs`가 생성하는 것:
  - `public/posts/index.json` — 메타데이터 + `searchText`(본문의 모든 헤더와 `- ` 구분점 텍스트를 추출, 코드 블럭 제외·인라인 서식 제거) + `categories`(content/categories.json과 게시물 파생 카테고리의 병합 — 게시물 0개 카테고리도 사이드바에 노출)
  - `public/posts/<slug>.md` — 본문 (frontmatter 제거)
  - `content/posts/`에 `draft: true` 파일이 남아 있어도 산출물에서 방어적으로 제외된다
- **게시물 이미지는 md와 동일한 격리 시맨틱** — 공개 글은 `content/images/<slug>/`(커밋 대상), 초안은 `content/drafts/images/<slug>/`(drafts 전체가 gitignore). PUBLISH 토글·서버 시작 방어 로직(`relocateDrafts`)이 md와 함께 이미지 디렉터리도 이동시키고, 게시물 삭제 시 함께 삭제된다. `buildPosts()`는 공개 글 이미지만 `public/posts/images/<slug>/`로 복사한다(초안 이미지는 어떤 환경에서도 산출물에 포함되지 않음 — dev 프리뷰는 에디터 플러그인이 content에서 직접 서빙).
- 본문 이미지 참조는 파일명만 쓴다: `![설명](name.webp)`. `MarkdownRenderer`의 `assetBase` prop이 상대 참조를 `${BASE_URL}posts/images/<slug>/…`로 해석한다(외부 URL·절대 경로는 그대로). alt 끝에 `|NN`(1~100)을 붙이면 **기본 표시 크기**(= min(원본, 컨테이너 폭)) 대비 상대 크기로 표시된다: `![설명|50](name.webp)` → 기본 표시 크기의 50% (100 또는 생략 = 기본 표시 크기). 구현은 `width: min(원본×N% px, N%)`.
- **미참조 이미지 자동 정리** — SAVE/PUBLISH(`savePost`)·DEPLOY(`deploy`) 시 본문(마크다운 `![]()` + raw HTML `<img src>`)이 참조하지 않는 이미지를 게시물 디렉터리에서 삭제한다(`pruneImages`). DELETE는 디렉터리째 삭제. 업로드 후 참조를 지우고 저장하면 파일도 함께 정리된다.
- `public/posts/`는 자동 생성물이므로 gitignore됨. dev 서버 시작 시와 md 변경 시 자동 재생성(연속 fs 이벤트는 디바운스).
- 클라이언트(`src/lib/posts.ts`)는 초기에 index.json만 fetch하고 본문은 열람 시 개별 fetch. 검색도 index.json의 `searchText`만 사용(검색 범위: 태그·제목·헤더·구분점).
- index.json은 모듈 캐시 + 구독 구조 — 에디터에서 게시물/카테고리 변경 시 `invalidatePostIndex()`가 캐시를 비우고 `usePostIndex` 사용처(사이드바 카테고리 등)를 새로고침 없이 재조회시킨다.

### 라우팅 (HashRouter — GitHub Pages 404 회피)
`/`(목록) · `/post/:slug` · `/tags` · `/tag/:tag` · `/category/:category` · `/search/:query` · `/editor`
PostPage/EditorPage는 React.lazy — KaTeX·highlight.js가 초기 번들에 포함되지 않도록 유지할 것.

### Markdown 렌더링
- `MarkdownRenderer`(뷰어·에디터 프리뷰 공용): remark-gfm/math + rehype-raw(밑줄 `<u>` 지원)/katex/highlight/slug
- 코드 블럭은 `CodeBlock` 래퍼 — hover 시 언어명(좌상단)·COPY 버튼(우상단), 색상은 NieR Automata Light 테마(shelune/vscode-nier-automata-light) 매핑
- **인터랙티브 함수 그래프** — ` ```graph ` 코드 펜스가 `FunctionGraph`(React.lazy — d3 청크가 graph 펜스 있는 글에서만 로드)로 렌더된다. 스펙은 **TOML**(smol-toml, TOML 1.0 고정 — 2026-07-09 구 줄 단위 문법에서 전량 이관, 구 문법은 TOML 구문 오류로 시끄럽게 거부됨): `fn = "식"`(필수, `x`·param 변수의 식 — 항상 문자열로 감쌈), `domain = [a, b]`(기본 [-10, 10]), `range = [a, b]`(y 표시 범위 — 점근선 함수는 지정 권장, 생략 시 자동), `[params]` 테이블의 `이름 = { default, min, max, step? }`(슬라이더 생성, step 생략 시 (max-min)/100, 선언 순서 = 표시 순서. 이름으로 TOML 리터럴 true/false/inf/nan 금지. 우측 텍스트박스로 값 직접 입력 가능 — Enter/blur 확정, 범위 밖·비숫자는 이전 값 복원 + 하단에 허용 범위 안내), `integral = [a, "식"]`(선택 — 곡선과 y=0 사이 음영 + 심프슨 수치 적분값 표시. 경계는 숫자 또는 문자열(param 식), x 불가). **다중 서브플롯**: `[[plot]]` 1~4개(각각 title·fn·domain·range·integral — 최상위 domain/range는 공통 기본값으로 상속, 최상위 fn·integral과는 혼용 금지) — 작성 순서대로 2개는 2×1, 3~4개는 2×2 배치(3개면 넷째 칸은 빈 칸), 모든 plot이 `[params]` 슬라이더 한 세트에 동기화되고 구역마다 타이틀 바·호버 readout을 가진다. plot 종류: `kind = "fn"`(기본) 또는 `kind = "circle"`(단위원 + 회전 반지름 — `angle = "<라디안이 되는 param 식>"` 필수, fn·domain·range·integral 금지, 종횡비 보정으로 원형 유지, 끝점 축 사영 점선 + θ/cos/sin readout). readout은 **항목당 한 줄**로 표시되며 `display.항목 = true/false`로 선택(**기본 전부 false — 명시한 것만 표시**, 다중 모드에서는 각 plot 안에 지정). fn plot: `x`(x readout + 호버 크로스헤어)·`fx`(f(x) readout + 호버 점)·`integral`(∫ 값 readout)·`graph.integral`(적분 음영·경계선 시각화 — 값과 분리)·`graph.point`(param 추적점 — `point = "<param 식>"` 키 필수, 곡선 위 링 마커가 슬라이더를 따라 움직이고 비호버 시 x·fx readout이 그 값을 추적) / circle: `theta`(θ readout + 반지름·끝점)·`cos`(x축 사영)·`sin`(y축 사영). integral은 값·시각화 둘 다 꺼져 있으면 계산째 생략. 곡선 샘플링은 적응형 — 인접 샘플의 y 변화가 표시 범위를 넘으면 재귀 세분(최대 2^6배 밀도)하고, 최대 깊이에서도 간극이 남으면 불연속으로 판정해 gap 처리한다(극점이 샘플 격자 사이를 지날 때 스파이크가 깜빡이던 문제의 해결책 — 판정 기준이 격자가 아니라 발산 여부라 프레임 간 일관적). 식 파서는 자체 구현(`src/lib/mathExpr.ts` — 외부 의존성 없음, `2x` 같은 곱셈 생략 미지원, 비유한값은 예외 없이 NaN/Infinity로 흘려 그래프에서 gap 처리), 스펙 파서는 `src/lib/graphSpec.ts`(TOML 파싱만 smol-toml — 외부 파서 최소화 원칙의 유일한 명시적 예외, 그 외 기능은 자체 구현 유지). **스펙 문법은 게시물 md에 영속되므로 하위 호환 확장만 허용.** D3는 수학(d3-scale·d3-shape)만 쓰고 SVG는 React가 렌더한다 — d3-selection 등 DOM 조작 모듈 도입 금지. viewBox 스케일링 대신 ResizeObserver 실측 폭으로 스케일을 재계산해 SVG 텍스트가 rem 규칙을 따른다. graph 펜스는 rehype-highlight `plainText`로 하이라이팅 제외, searchText에서도 자동 제외(코드 블럭 규칙).
- 게시물 우측 목차(`TableOfContents`)는 **H1(`# `)만 인식** — 글의 최상위 섹션은 `#`으로 작성하는 것이 컨벤션. id는 rehype-slug와 동일한 github-slugger로 생성하므로 두 로직이 항상 같은 규칙을 써야 한다. HashRouter와 충돌하므로 앵커 이동은 URL 해시가 아닌 `scrollIntoView`로 처리.

### 에디터 (로컬 전용)
- `scripts/editor-plugin.mjs` — Vite dev 미들웨어(`apply: 'serve'`): `/api/posts` CRUD, `/api/categories`(목록·추가·이름 수정·삭제 — `content/categories.json`은 게시물 파생 카테고리와 **항상 동기화**(서버 시작·게시물 저장/삭제·md 변경 시 `syncCategories`), 이름 수정은 사용 중인 게시물 frontmatter까지 일괄 갱신, 사용 중이면 삭제 409. 카테고리 변경 후에는 반드시 `buildPosts()`로 index.json을 재생성해야 사이드바에 반영된다), `/api/images/:slug`(바이너리 업로드 → sharp로 WebP q80·최대 폭 1600px 변환, SVG는 원본 유지, 파일명 sanitize + 충돌 시 서픽스), `/api/deploy/preview`(origin/master 대비 공개 상태 변화 계산, git status 범위는 content 전체), `/api/deploy`(git add/commit/push). `posts/images/` 요청을 content에서 직접 서빙하는 미들웨어도 포함(초안 이미지 프리뷰용, base 유무 모두 매칭). sharp는 devDependency이며 지연 로드(vite.config가 이 모듈을 빌드 시에도 import하므로). 배포된 정적 사이트에는 존재하지 않는다.
- `src/pages/EditorPage.tsx` — 로컬 dev 전용 페이지. App.tsx가 `import.meta.env.DEV`일 때만 `/editor` 라우트를 등록하고 AppFrame도 dev에서만 EDITOR 메뉴를 노출하므로, 프로덕션에서는 라우트·메뉴·청크가 모두 제거된다(`/#/editor` 접근 시 홈으로 리다이렉트). 새 글은 draft로 생성되며 PUBLISH 토글로 공개 전환. 배포 다이얼로그가 공개/비공개 상태 변화를 보여준다.
- `MarkdownToolbar` — 텍스트 선택 후 버튼으로 서식 적용(좌측 끝 CLR은 서식 제거). 카테고리는 드롭다운(기존 목록 + "새 카테고리" prompt).
- **이미지 삽입** — textarea에 붙여넣기/드래그&드롭 또는 도구바 IMG 버튼 → `/api/images` 업로드 후 커서 위치에 `![](파일명.webp)` 삽입. 미저장 새 글은 업로드 전에 자동 저장된다(저장 위치가 초안/공개 디렉터리로 갈리기 때문).
- 에디터 상단 탭바(포스팅 | 카테고리 편집): 포스팅 탭이 기존 에디터, 카테고리 편집 탭이 `CategoryManager`(목록·추가·삭제). 탭 전환 시 작성 중인 폼이 유지되도록 에디터는 언마운트하지 않고 `.editor--hidden`으로 숨긴다.

### 테마·타이포그래피
- 스타일은 `src/theme/nier.css` 하나에 CSS 변수(`--nier-*`) 기반으로 모여 있다. 새 UI는 기존 변수·클래스 패턴(패널, 반전 호버)을 재사용할 것.
- 테마 레퍼런스 이미지는 `reference-files/nier_theme.jpeg` (gitignore됨) — 배경 장식(비네트·격자·모서리 원호 도형)은 `Background.tsx` + `.bg-layer`/`.bg-figure`가 담당.
- **모든 font-size는 rem** — 루트 기본 18px, `FontSizeControl`(사이드바 상단)이 `html.style.fontSize`를 12~22px로 조절하고 localStorage(`nephthys-font-size`)에 저장한다. px로 글씨 크기를 지정하면 이 기능이 깨진다.

### 컴포넌트 설계 원칙 (Three.js 대비)
- 레이아웃 요소(`src/components/layout/` — TopBar, SideTabBar, Background)는 데이터/콜백만 props로 받는 독립 파일로 유지한다. 차후 @react-three/fiber 도입 시 파일 단위로 3D 버전으로 교체하는 것이 전제. `Background`가 R3F Canvas로 바뀌는 첫 지점.
- 에디터처럼 넓은 화면이 필요한 페이지는 AppFrame이 라우트를 보고 `app-content--wide`를 붙인다(기본 본문 폭 980px 제한 해제).

### 배포
- vite `base: '/nephthys-blog/'`. `.github/workflows/deploy.yml`이 master push 시 빌드 후 Pages 배포 (저장소 Settings → Pages → Source가 "GitHub Actions"여야 함).

## Conventions

- **git commit·push는 사용자가 직접 수행한다** — Claude는 파일 수정까지만 하고 커밋하지 않는다.
- 커밋 메시지는 한국어로 작성한다.
- `tsconfig.app.json`은 strict + `noUnusedLocals`/`noUnusedParameters` — 미사용 코드는 빌드 실패.
- ESLint의 `react-hooks/set-state-in-effect` 규칙이 활성 — effect 본문에서 동기 setState 금지 (promise 콜백에서 처리하고, slug 등 키를 함께 저장해 stale 상태를 걸러내는 패턴 사용).
- 게시물 본문의 최상위 섹션 헤더는 `#`(H1) — 목차가 H1만 인식한다.
