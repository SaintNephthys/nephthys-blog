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
- **인터랙티브 그래프** — ` ```graph ` 코드 펜스가 `FunctionGraph`(React.lazy — d3 청크가 graph 펜스 있는 글에서만 로드)로 렌더된다. 스펙은 **수학 문장 DSL**(2026-07-10 TOML 전면 폐기·smol-toml 제거 — 자체 문장 파서, 외부 파서 의존성 0. 개정 근거·설계는 devnotes 참조): 줄 하나 = 문장 하나, 분류는 좌변 형태 + 우변 자유변수의 **결정적 규칙**이고 판별 불능·미선언 식별자는 행 번호를 짚는 시끄러운 오류(조용한 오해석 금지). 문장 종류 — **곡선**: `f(x) = 식`(이름으로 도구에서 참조 가능, 인자가 x가 아니면 그리지 않는 헬퍼) · `y = 식` · `f'`(기호 미분 도함수 곡선) · 음함수(x·y 방정식, 마칭 스퀘어) · 부등식(참 영역 음영) · 극곡선 `r = 식(theta)` · 매개변수 `(x식, y식), s in [a, b]` · 수열 `a_n = 식, n in [a, b]` · 방향장 `y' = 식(x, y)` / **param**: `이름 = 기본값 : [min, max, step?]`(우변 상수 — 범위 없으면 고정 상수. 슬라이더 + 값 직접 입력 박스) / **도구**: `tangent(f, at)`·`secant(f, a, b)`·`integral(f, [a, b])`(음영+심프슨 ∫값)·`riemann(f, [a, b], n, left|mid|right)`·`area(f, g, [a, b])`·`intersect(A, B)`(함수×함수/음함수 — 이분법 교점)·`point(f, at)|point(x식, y식)`·`vector(p, q)`·`segment(p, q)`·`line(p, 기울기)`·`label(p, "텍스트")` — 인자는 param 식 허용 / **지시문**: `view x[a, b] y[c, d] equal?`(생략 시 x [-10,10]·y 자동, equal = 종횡비 등화) · `--- 제목`(구역 1~4개 — 2개 2×1, 3~4개 2×2, 첫 --- 이전은 공통 영역(param·상수·헬퍼·view·animate만)) · `animate 이름: a -> b, 초s, loop|once`(▶/■ 토글, 기본 정지) · `hide 아이템[.슬롯]`/`show`/`hide hover` · `# 주석` / **라벨**: `이름: 문장`(교과서 "곡선 C:" 표기 — 도구 참조·hide 대상 이름). **선언한 것의 자연 표시가 기본 on**(hide로 미세 조정 — 구 display 플래그 체계 폐기). 식 문법: 숫자·괄호 뒤 곱셈 생략(`2x`·`(x+1)(x-1)` — 식별자끼리는 `*` 필수), `if(조건, a, b)`·`sum(k, a, b, 식)`·`nCr`·`fact`, 유니코드 별칭(θ·π·`·`·≤·≥ 수용, 정규형은 ASCII). 이름 규칙: x·y·theta 전면 예약, r·n·s는 param·상수로만 허용(수열·매개변수 문장 안에서는 바인더가 섀도잉). **DSL 문장 형태·분류 규칙·도구 시그니처·기본 표시는 게시물 md에 영속되므로 하위 호환 확장(widening)만 허용.** 구조: `src/lib/expr/`(식 AST·컴파일러·**기호 미분** — 모든 문장의 단일 원천, 포크 금지) → `src/lib/scene/`(문장 파서 → Scene IR — 문법과 렌더 사이의 방화벽) → `src/lib/plot/`(적응형 샘플링·마칭 스퀘어·심프슨·이분법 — 순수 수학 커널) → `src/components/post/graph/`(FunctionGraph 컨테이너 + SectionPlot 아이템 디스패치 + ParamControls). 적응형 샘플링(점근선 깜빡임 해결책)은 판정 기준이 발산 여부라 프레임 간 일관적. D3는 수학(d3-scale·d3-shape)만 쓰고 SVG는 React가 렌더한다 — d3-selection 등 DOM 조작 모듈 도입 금지. viewBox 스케일링 대신 ResizeObserver 실측 폭으로 스케일을 재계산해 SVG 텍스트가 rem 규칙을 따른다. 곡선 구분색은 `.fngraph`의 `--fngraph-c0~c3` 변수만 사용. graph 펜스는 rehype-highlight `plainText`로 하이라이팅 제외, searchText에서도 자동 제외(코드 블럭 규칙). **문법 명세 전문·아이템 추가 절차·검증 방법은 `docs/function-graph-devnotes.md`(gitignore) 필독.**
- 게시물 우측 목차(`TableOfContents`)는 **H1(`# `)만 인식** — 글의 최상위 섹션은 `#`으로 작성하는 것이 컨벤션. id는 rehype-slug와 동일한 github-slugger로 생성하므로 두 로직이 항상 같은 규칙을 써야 한다. HashRouter와 충돌하므로 앵커 이동은 URL 해시가 아닌 `scrollIntoView`로 처리.

### 에디터 (로컬 전용)
- `scripts/editor-plugin.mjs` — Vite dev 미들웨어(`apply: 'serve'`): `/api/posts` CRUD, `/api/categories`(목록·추가·이름 수정·삭제 — `content/categories.json`은 게시물 파생 카테고리와 **항상 동기화**(서버 시작·게시물 저장/삭제·md 변경 시 `syncCategories`), 이름 수정은 사용 중인 게시물 frontmatter까지 일괄 갱신, 사용 중이면 삭제 409. 카테고리 변경 후에는 반드시 `buildPosts()`로 index.json을 재생성해야 사이드바에 반영된다), `/api/images/:slug`(바이너리 업로드 → sharp로 WebP q80·최대 폭 1600px 변환, SVG는 원본 유지, 파일명 sanitize + 충돌 시 서픽스), `/api/deploy/preview`(origin/master 대비 공개 상태 변화 계산, git status 범위는 content 전체), `/api/deploy`(git add/commit/push). `posts/images/` 요청을 content에서 직접 서빙하는 미들웨어도 포함(초안 이미지 프리뷰용, base 유무 모두 매칭). sharp는 devDependency이며 지연 로드(vite.config가 이 모듈을 빌드 시에도 import하므로). 배포된 정적 사이트에는 존재하지 않는다.
- `src/pages/EditorPage.tsx` — 로컬 dev 전용 페이지. App.tsx가 `import.meta.env.DEV`일 때만 `/editor` 라우트를 등록하고 AppFrame도 dev에서만 EDITOR 메뉴를 노출하므로, 프로덕션에서는 라우트·메뉴·청크가 모두 제거된다(`/#/editor` 접근 시 홈으로 리다이렉트). 새 글은 draft로 생성되며 PUBLISH 토글로 공개 전환. 배포 다이얼로그가 공개/비공개 상태 변화를 보여준다.
- `MarkdownToolbar` — 텍스트 선택 후 버튼으로 서식 적용(좌측 끝 CLR은 서식 제거). 카테고리는 드롭다운(기존 목록 + "새 카테고리" prompt). **GRAPH 버튼**(IMG 옆) → `GraphComposer` 창: |분류|문장 팔레트|미리보기| 3열 — 항목 클릭으로 DSL 문장을 편집 가능한 버퍼에 추가(참조하는 f·param 선언이 버퍼에 없으면 자동 동반 — 자기 일관 원칙), 프리셋(접선과 도함수·리만합·원과 직선·단위원·방향장·테일러) 원클릭, 적용 시 커서 위치에 ```graph 펜스 삽입. 새 문장 형태·도구를 문법에 추가하면 `GraphComposer.tsx` 팔레트도 갱신할 것.
- **이미지 삽입** — textarea에 붙여넣기/드래그&드롭 또는 도구바 IMG 버튼 → `/api/images` 업로드 후 커서 위치에 `![](파일명.webp)` 삽입. 미저장 새 글은 업로드 전에 자동 저장된다(저장 위치가 초안/공개 디렉터리로 갈리기 때문).
- 에디터 상단 탭바(포스팅 | 카테고리 편집 | 그래프 가이드): 포스팅 탭이 기존 에디터, 카테고리 편집 탭이 `CategoryManager`(목록·추가·삭제), 그래프 가이드 탭이 `GraphGuide`(```graph DSL 문법 레퍼런스 표 5종 — 선언 문장·도구 문장·지시문·식 문법·이름 규칙. 문법과 별도 소유라 새 문장·도구 추가 시 GraphComposer 팔레트와 함께 갱신할 것). 탭 전환 시 작성 중인 폼이 유지되도록 에디터는 언마운트하지 않고 `.editor--hidden`으로 숨긴다.

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
