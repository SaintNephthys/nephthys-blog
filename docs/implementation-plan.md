# Nephthys Blog 구현 계획 · 현황

GitHub Pages(`https://saintnephthys.github.io/nephthys-blog/`)에 호스팅하는 개인 블로그.
NieR:Automata UI 테마(`reference-files/nier.jpeg` 참조)를 적용하고, 차후 Three.js 기반 3D UI로
확장 가능하도록 UI를 개별 React 컴포넌트로 분리하여 제작한다.

> **상태 (2026-07-03 기준)**: 계획의 1~6단계 전부 구현 완료.
> 이후 추가 요구사항(검색, 카테고리, 목차, 글씨 크기 조절, 에디터 도구바 등)도 반영됨 — §9 참조.
> 남은 것: 커밋/push, 저장소 Settings → Pages → Source "GitHub Actions" 설정, (차후) Three.js 도입.

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | React 19 + Vite + TypeScript | |
| 라우팅 | react-router-dom (HashRouter) | GitHub Pages에서 404 리다이렉트 트릭 없이 동작 |
| Markdown | react-markdown + remark-gfm + rehype-raw | 표·취소선, `<u>` 밑줄 등 raw HTML 지원 |
| 수학 | remark-math + rehype-katex (KaTeX) | 인라인/블록 수식 |
| 코드 하이라이팅 | rehype-highlight (highlight.js) | 게시물 조회 시 lazy load, NieR Automata Light 색상 |
| 헤더 앵커 | rehype-slug + github-slugger | 목차(TOC) 앵커 생성 |
| 3D (차후) | three + @react-three/fiber + drei | R3F는 Three.js 객체를 React 컴포넌트로 다루므로 "Model Component" 교체 방식에 최적 |

상태 관리 라이브러리는 도입하지 않는다(게시물 데이터는 fetch + 컴포넌트 로컬 상태로 충분).

## 2. 디렉터리 구조 (구현 결과)

```
content/posts/            # 게시물 원본 (frontmatter + markdown)
scripts/
  build-posts.mjs         # content → public/posts 변환 + index.json 생성 (searchText 추출 포함)
  editor-plugin.mjs       # dev 전용 에디터 API (Vite 미들웨어)
public/posts/             # 빌드 산출물 — 자동 생성물이므로 gitignore (계획 변경, §3 참조)
src/
  components/
    layout/               # AppFrame, TopBar(검색창), SideTabBar(카테고리 펼침), Background
    post/                 # PostList, PostCard, PostViewer, MarkdownRenderer, TableOfContents, TagList
    editor/               # MarkdownToolbar (서식 도구바)
    widgets/              # Panel, FontSizeControl
    three/                # (차후) R3F 모델 컴포넌트 자리
  pages/                  # Home, Post, Tags, Tag, Category, Search, Editor
  lib/                    # posts.ts, usePostIndex.ts, editorApi.ts
  theme/nier.css          # 테마 변수 + 전역 스타일 (모든 font-size는 rem)
```

핵심 원칙: **레이아웃 컴포넌트는 데이터와 콜백만 props로 받고 표현을 내부에 캡슐화**한다.
차후 Three.js 도입 시 파일 단위 교체만 하면 되도록 한다. `Background`가 R3F Canvas로 바뀌는 첫 지점.

## 3. 콘텐츠 파이프라인 (GitHub Pages 최적화 분할)

1. 게시물은 `content/posts/*.md`에 frontmatter(title, date, **category**, tags, summary, draft)와 함께 저장.
2. `scripts/build-posts.mjs`가 빌드 전(`prebuild` / dev 서버 시작·저장 시) 실행되어:
   - frontmatter를 파싱해 `public/posts/index.json` 생성 (날짜 역순 정렬)
   - 각 게시물의 **검색용 텍스트(`searchText`)** 를 추출해 index.json에 포함 — 모든 헤더와 `- ` 구분점 텍스트, 코드 블럭 제외·인라인 서식 제거
   - 본문 md(frontmatter 제거)를 `public/posts/<slug>.md`로 복사
   - **draft 게시물은 `content/drafts/`(gitignore)에 격리** — 저장소에 올라가지 않고,
     `content/posts/`에 `draft: true` 파일이 남아 있어도 산출물에서 방어적으로 제외된다
3. **게시물 이미지**: 공개 글은 `content/images/<slug>/`(커밋 대상), 초안은
   `content/drafts/images/<slug>/`(gitignore 영역) — md와 동일한 격리 시맨틱.
   에디터 업로드 시 sharp가 WebP(q80, 최대 폭 1600px)로 변환해 저장하고(SVG는 원본 유지),
   `buildPosts()`가 공개 글 이미지만 `public/posts/images/<slug>/`로 복사한다.
   본문 참조는 파일명만(`![](name.webp)`) — MarkdownRenderer의 `assetBase`가
   `${BASE_URL}posts/images/<slug>/`로 해석하므로 dev/배포 URL이 항상 일치한다.
4. 런타임 로딩: 초기에는 index.json만, 게시물 본문은 열람 시 개별 fetch. KaTeX·highlight.js·에디터는 React.lazy로 분리.

> **계획 변경**: `public/posts/`는 커밋하지 않고 gitignore한다. CI가 빌드 시(`prebuild`) 직접
> 생성하므로 커밋 노이즈와 충돌이 없다.

## 4. 에디터 페이지 (작성 → 편집 → 저장 → 게시 → 배포)

로컬 개발 서버 전용 (정적 호스팅에서는 파일 쓰기가 불가능하므로). `/editor` 라우트와
EDITOR 메뉴는 dev에서만 등록되어(`import.meta.env.DEV`) 프로덕션 빌드에서는 라우트·메뉴·청크가
전부 제거된다 — 배포된 사이트에서 `/#/editor` 접근 시 홈으로 리다이렉트.

- `scripts/editor-plugin.mjs` (Vite dev 미들웨어):
  - `GET/PUT/DELETE /api/posts[/:slug]` — 목록(draft 포함)·단건·저장·삭제
  - `GET /api/deploy/preview` — origin/master 대비 공개 상태 변화(새로 공개/비공개 전환/내용 갱신/draft) 계산
  - `POST /api/deploy` — git add → commit → push (push 후 GitHub Actions가 자동 배포)
- EditorPage 구성: 좌측 게시물 목록(초안/게시됨 그룹, DRAFT 배지), 중앙 편집 폼
  (제목/날짜/slug/**카테고리 드롭다운**/태그/요약 + **Markdown 도구바** + textarea),
  우측 실시간 프리뷰(MarkdownRenderer 재사용). 에디터 라우트는 본문 폭 제한 해제(`app-content--wide`).
- Markdown 도구바: 텍스트 선택 후 클릭으로 적용 — 좌측 끝 CLR(서식 제거), B/I/U/S,
  H1~H3, 인라인 코드/코드 블럭/인용/링크.
- 카테고리 드롭다운: 기존 카테고리 선택 또는 "+ 새 카테고리…"로 즉석 추가.

### Draft 게시물 운용

- 새 글은 기본값 `draft: true`로 생성되어 `content/drafts/`(gitignore)에 저장 — 저장·배포를
  반복해도 초안은 저장소에 올라가지 않는다. PUBLISH 시 파일이 `content/posts/`로 이동한다.
- dev 서버 시작 시 `content/posts/`에 남은 `draft: true` 파일을 자동으로 `content/drafts/`로 이동.
- 에디터 목록은 "게시됨/초안" 그룹으로 구분, 초안에는 DRAFT 배지.
- PUBLISH/UNPUBLISH 토글로 공개 상태 전환(전환 후 배포해야 반영).
- 배포 확인 다이얼로그에 이번 배포로 공개/비공개가 바뀌는 게시물 목록을 표시해 의도치 않은 공개를 방지.

워크플로: `npm run dev` → `/#/editor` → 새 글 작성(draft) → 저장 반복 → PUBLISH → DEPLOY(git push)
→ GitHub Actions가 빌드·배포.

## 5. 라우팅 · 배포 설정

- `vite.config.ts`: `base: '/nephthys-blog/'`, dev 전용 editorApiPlugin.
- HashRouter 라우트: `/` · `/post/:slug` · `/tags` · `/tag/:tag` · `/category/:category` · `/search/:query` · `/editor`
- `.github/workflows/deploy.yml`: master push 시 `npm ci → npm run build` → Pages 배포.
  (저장소 Settings → Pages → Source를 "GitHub Actions"로 설정 필요)

## 6. NieR 테마 (구현 결과)

- 테마 레퍼런스는 `reference-files/nier_theme.jpeg` — 배경색·격자·모서리 도형을 이 이미지 기준으로 구현.
- 팔레트는 `nier.css`의 CSS 변수(`--nier-*`)로 정의: 배경 `#e2d6bc`(레퍼런스 실측), 패널 `#f2ecda`,
  다크 `#4c4a43`, 텍스트 `#454138`, 경고 `#b05a4a` 등.
- 배경(`Background` + `.bg-layer`): 좌우 가장자리 비네트(어두움), 8px 격자(opacity 0.15),
  좌상단/우하단 모서리 도형(이중 원호 + 45° 평행선 SVG — 모든 선은 화면 밖까지 이어진다).
  우하단 도형은 브라우저가 16:9보다 넓으면 우측 끝을 따라가고, 좁으면 16:9 시점 위치에 고정되어 잘린다.
- 공용 `Panel`(다크 타이틀바 + 밝은 본문), 텍스트-배경 반전 호버.
- **타이포그래피는 전부 rem** — 루트 기본 18px, `FontSizeControl`(사이드바 상단, A−/%/A+)이
  12~22px 범위로 조절하고 localStorage에 저장.
- 코드 블럭: [shelune/vscode-nier-automata-light](https://github.com/shelune/vscode-nier-automata-light)
  테마 색상 매핑 (배경 `#DAD3BA`, 키워드 `#B56151`, 문자열 `#727B5B`, 함수 `#CC654C`,
  타입 `#3BA49A` 등). hover 시 언어명(좌상단)·COPY 버튼(우상단) — Obsidian 방식.

## 7. 구현 단계 (전체 완료)

| 단계 | 내용 | 상태 |
|---|---|---|
| 1. 기반 | 템플릿 정리, 라우팅, 테마, AppFrame/TopBar/SideTabBar/Background | ✅ |
| 2. 콘텐츠 파이프라인 | build-posts(draft 제외), index.json, lib/posts.ts, 샘플 게시물 | ✅ |
| 3. 게시물 뷰 | PostList/Card/Viewer, MarkdownRenderer(GFM+KaTeX+하이라이팅) | ✅ |
| 4. 에디터 | dev API 플러그인, EditorPage(draft 관리·게시 토글·배포 다이얼로그) | ✅ |
| 5. 배포 | vite base, GitHub Actions 워크플로 | ✅ |
| 6. 마감 | 반응형(모바일 탭바 접기), 문서화 | ✅ |
| (차후) | @react-three/fiber 도입, Background/위젯을 3D Model Component로 교체 | 예정 |

## 8. 게시물 작성 컨벤션

- frontmatter: `title, date, category, tags, summary, draft`
- **본문 최상위 섹션 헤더는 `#`(H1)** — 게시물 우측 목차(CONTENTS)가 H1만 인식한다.
- 수식 `$...$`/`$$...$$`, GFM 표, `<u>` 밑줄 사용 가능. 코드 블럭에는 언어를 명시(hover 라벨에 표시됨).

## 9. 계획 이후 추가된 기능 (요구사항 반영 이력)

- 에디터 폼/프리뷰 2열이 넓은 화면을 활용하도록 에디터 라우트 폭 제한 해제 (`app-content--wide`)
- 전역 글씨 크기 rem 전환 + 기본 크기 18px(기존 대비 113%) + 사이드바 글씨 크기 조절 버튼
- 에디터 Markdown 도구바 (선택 후 적용, 좌측 끝 스타일 제거)
- 코드 블럭 hover 언어명·COPY 버튼, NieR Automata Light 코드 색상, 상하 여백
- blockquote 텍스트를 본문과 동일 색상으로
- 게시물 우측 CONTENTS 목차 (H1 인식, 클릭 스크롤, 1200px 이하 숨김)
- 상단바 시계 제거 → 검색창 (검색 범위: 태그·제목·모든 헤더·`- ` 구분점 텍스트, 빌드 시 searchText로 추출)
- 검색 결과 전용 카드 레이아웃 (카테고리·태그 한 줄 + 요약)
- 카테고리: frontmatter 필드, 사이드바 CATEGORIES 펼침 메뉴(게시물 수 표시), 카테고리 페이지, 에디터 드롭다운(신규 추가 지원)
- 에디터 탭바(포스팅 | 카테고리 편집) + 카테고리 편집 화면: 목록(게시물 수)·추가·이름 수정(게시물 frontmatter 일괄 갱신)·삭제.
  빈 카테고리는 `content/categories.json`에 영속화(게시물 파생 카테고리와 병합), 게시물이 사용 중인 카테고리는 삭제 차단
- 게시물 뷰 하단 `← ARCHIVES` 버튼 밑줄 제거 (`.btn`에 `text-decoration: none`)
- 코드 블럭 개선: 배경 `#f2ecda`(--nier-panel) + NieR 색 계열을 유지한 비비드 하이라이팅
  (전 토큰 WCAG AA 4.5:1 이상) + 줄 번호 거터(가로 스크롤 시 sticky, 복사에 미포함)
- 이미지 삽입 (§3 참조): 에디터 붙여넣기/드롭/IMG 버튼 업로드 → WebP 변환,
  게시물별 디렉터리 관리, 초안 이미지는 gitignore 격리(PUBLISH 토글·서버 시작 방어 스윕이
  md와 함께 이동), 게시물 삭제 시 이미지 일괄 정리, `.markdown img` 테마 스타일
- 이미지 상대 크기 문법: `![alt|50](img)` → 기본 표시 크기(= min(원본, 컨테이너 폭))의
  50%로 표시 (1~100, 100/생략 = 기본 표시 크기). 구현: `width: min(원본×N% px, N%)`
- 미참조 이미지 자동 정리: SAVE·PUBLISH·DEPLOY 시 본문이 참조하지 않는 이미지를
  게시물 디렉터리에서 삭제 (DELETE는 디렉터리째 삭제)
- 인터랙티브 함수 그래프 (2026-07-08, 최소 스펙): ` ```graph ` 펜스 →
  `FunctionGraph` 컴포넌트(React.lazy 청크 — d3-scale·d3-shape는 graph 펜스 있는
  글에서만 로드). 파라미터 슬라이더(NieR 설정 화면풍 사각 핸들)로 곡선 실시간 갱신,
  호버 크로스헤어로 함숫값 표시, 비유한값 구간은 gap 처리, 스펙/식 오류는 오류 패널.
  식 파서는 자체 구현(`mathExpr.ts`), 스펙 문법(`graphSpec.ts`)은 fn·domain·range·param
  4키만 — md에 영속되므로 하위 호환 확장만. D3는 수학만 담당하고 SVG는 React가 렌더,
  ResizeObserver 실측으로 rem 타이포 규칙 유지.
- 함수 그래프 개선 (2026-07-08 2차): ① 적응형 샘플링 — 인접 샘플 y 변화가 표시
  범위를 넘으면 재귀 세분(기본 800 샘플, 최대 2^6배 국소 밀도), 최대 깊이에서도
  간극이 남으면 불연속 gap 처리. 극점이 샘플 격자 사이를 지날 때 점근선 스파이크가
  깜빡이던 문제 해결(판정 기준이 격자 위치가 아닌 발산 여부). 거대 유한값은 표시
  범위 ±2배로 클램프해 분기 끝이 안정적으로 화면 밖까지 이어진다.
  ② `integral: [a, b]` 키 추가(하위 호환 확장) — 곡선과 y=0 사이 음영(accent 색)
  + 경계 세로선 + 합성 심프슨 수치 적분값 표시. 경계는 숫자 또는 param 식.
- 함수 그래프 개선 (2026-07-08 3차): 파라미터 값 직접 입력 — 슬라이더 우측 값
  표시가 텍스트박스로 바뀌어 Enter/blur로 확정. 범위 이내 숫자면 param에 반영되고
  슬라이더도 해당 위치로 이동, 범위 밖·비숫자면 입력 전 값으로 복원하고 박스 하단에
  허용 범위 안내(`min ~ max 사이의 숫자를 입력하세요`)를 표시(재입력 시 사라짐).
- 함수 그래프 개선 (2026-07-09 4차): 스펙 문법을 TOML로 전량 이관(smol-toml,
  TOML 1.0 고정) — `fn = "식"` · `domain/range = [a, b]` · `[params]`의
  `이름 = { default, min, max, step? }` · `integral = [a, "식"]`. 구 줄 단위 문법은
  폐기 — TOML 구문 오류로 시끄럽게 거부되어 조용한 오해석이 없다. 기존 게시물
  1개(펜스 4개)는 수동 이관. 근거: 다중 플롯·3D 등 중첩 구조 로드맵 대비 +
  콘텐츠 최소 시점(이관 총비용 최소). 외부 파서 최소화 원칙은 유지하되
  smol-toml만 명시적 예외. param 이름으로 TOML 리터럴(true/false/inf/nan) 금지.
