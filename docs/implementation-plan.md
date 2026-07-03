# Nephthys Blog 구현 계획

GitHub Pages(`https://saintnephthys.github.io/nephthys-blog/`)에 호스팅하는 개인 블로그.
NieR:Automata UI 테마(`reference-files/nier.jpeg` 참조)를 적용하고, 차후 Three.js 기반 3D UI로
확장 가능하도록 UI를 개별 React 컴포넌트로 분리하여 제작한다.

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | React 19 + Vite + TypeScript | 현재 스캐폴드 유지 |
| 라우팅 | react-router-dom (HashRouter) | GitHub Pages에서 404 리다이렉트 트릭 없이 동작 |
| Markdown | react-markdown + remark-gfm | 표, 취소선 등 GFM 지원 |
| 수학 | remark-math + rehype-katex (KaTeX) | 인라인/블록 수식 |
| 코드 하이라이팅 | rehype-highlight (highlight.js) | 게시물 조회 시 lazy load |
| 3D (차후) | three + @react-three/fiber + drei | R3F는 Three.js 객체를 React 컴포넌트로 다루므로 "Model Component" 교체 방식에 최적 |

상태 관리 라이브러리는 도입하지 않는다(게시물 데이터는 fetch + 컴포넌트 로컬 상태로 충분).

## 2. 디렉터리 구조

```
content/
  posts/                  # 게시물 원본 (frontmatter + markdown)
    2026-07-03-hello.md
scripts/
  build-posts.mjs         # content → public/posts 변환 + index.json 생성
public/
  posts/                  # 빌드 산출물 (배포용, gitignore 하지 않음)
    index.json            # 전체 게시물 메타데이터 (제목/날짜/태그/요약/slug)
    <slug>.md             # 게시물 본문 (개별 fetch)
src/
  components/
    layout/
      AppFrame.tsx        # 전체 레이아웃 골격 (상단바 + 좌측 탭바 + 콘텐츠 영역)
      TopBar.tsx          # 상단바 (블로그 제목, 시계/날짜 등 NieR 스타일 요소)
      SideTabBar.tsx      # 좌측 탭바 (홈/태그/카테고리/소개 네비게이션)
      Background.tsx      # 배경 레이어 (그리드 라인, 장식) — 차후 Three.js Canvas로 교체되는 지점
    post/
      PostList.tsx        # 게시물 목록
      PostCard.tsx        # 목록의 개별 항목 (NieR 패널 스타일)
      PostViewer.tsx      # 게시물 본문 화면
      MarkdownRenderer.tsx# markdown → HTML (수식/코드 포함, 뷰어·에디터 프리뷰 공용)
    widgets/
      Panel.tsx           # 다크 타이틀바 + 본문으로 구성된 NieR 스타일 공용 패널
      StatusWidget.tsx 등 # 장식용 위젯 (선택)
    three/                # (차후) R3F 모델 컴포넌트 자리
  pages/
    HomePage.tsx          # index.json 기반 목록
    PostPage.tsx          # /#/post/:slug — 해당 md만 fetch
    TagPage.tsx           # /#/tag/:tag — index.json 필터링
    EditorPage.tsx        # /#/editor — 작성/편집/저장/배포 (lazy import)
  lib/
    posts.ts              # index.json / 게시물 fetch, 타입 정의
    editorApi.ts          # 에디터 ↔ dev 서버 API 클라이언트
  theme/
    nier.css              # 테마 변수 + 전역 스타일
```

핵심 원칙: **레이아웃 컴포넌트(TopBar, SideTabBar, Background 등)는 데이터와 콜백만 props로
받고 표현을 내부에 캡슐화**한다. 차후 Three.js 도입 시 각 컴포넌트를 R3F 버전으로 파일 단위
교체만 하면 되도록 한다. `AppFrame`은 z-index 레이어(배경 canvas 층 / UI 층)를 처음부터 분리해 둔다.

## 3. 콘텐츠 파이프라인 (GitHub Pages 최적화 분할)

1. 게시물은 `content/posts/*.md`에 frontmatter(title, date, tags, summary, draft)와 함께 저장.
2. `scripts/build-posts.mjs`가 빌드 전(`prebuild` / dev 시작 시) 실행되어:
   - 모든 md의 frontmatter를 파싱해 `public/posts/index.json` 생성 (날짜 역순 정렬)
   - 본문 md를 `public/posts/<slug>.md`로 복사
   - **`draft: true`인 게시물은 index.json과 `public/posts/`에서 제외** — 미완성 글이
     git push에 포함되더라도 배포된 블로그에는 절대 노출되지 않는다
3. 런타임 로딩:
   - 초기 로드: 앱 셸 + `index.json`만 (목록 렌더링에 필요한 최소 데이터)
   - 게시물 열람: 해당 `<slug>.md` 하나만 fetch → MarkdownRenderer로 렌더
   - KaTeX CSS/highlight.js/에디터 페이지는 dynamic import로 코드 스플리팅

→ 게시물이 늘어나도 초기 번들 크기가 일정하며, 정적 파일만으로 동작하므로 GitHub Pages에 최적.

## 4. 에디터 페이지 (작성 → 편집 → 저장 → 배포)

로컬 개발 서버 전용 페이지로 구현한다 (정적 호스팅에서는 파일 쓰기가 불가능하므로).

- Vite 플러그인으로 dev 서버에 미들웨어 API 추가:
  - `GET /api/posts` — 게시물 목록/본문 읽기 (draft 포함, 에디터 전용이므로 전체 노출)
  - `PUT /api/posts/:slug` — `content/posts/`에 저장 (frontmatter 포함)
  - `DELETE /api/posts/:slug` — 삭제
  - `POST /api/deploy` — `git add → commit → push` 실행 (push 후 GitHub Actions가 자동 배포)
- EditorPage 구성: 좌측 markdown 입력(textarea 기반), 우측 실시간 프리뷰(MarkdownRenderer 재사용),
  frontmatter 폼(제목/태그/요약), 저장·배포 버튼과 진행 상태 표시.
- 프로덕션 빌드에서는 에디터 라우트 접속 시 "로컬 dev 서버에서만 사용 가능" 안내를 표시.

### Draft 게시물 운용

- **새 글은 기본값 `draft: true`로 생성**된다. 작성 중 몇 번을 저장하고 배포하더라도
  빌드 스크립트가 draft를 제외하므로 블로그에 노출되지 않는다.
- 에디터의 게시물 목록은 **"게시됨 / 초안" 두 그룹으로 구분 표시**하고, 초안에는
  DRAFT 배지를 붙인다 (NieR 테마의 반전 색상 라벨).
- 에디터 프리뷰는 draft 여부와 무관하게 항상 렌더링되므로, 공개 전에 실제 게시물과
  동일한 모습(수식·코드 하이라이팅 포함)을 확인할 수 있다.
- **"게시(Publish)" 버튼**: frontmatter의 `draft: true`를 제거(또는 `false`로 변경)하고
  저장한다. 이후 배포하면 블로그에 공개된다. 반대로 공개된 글을 다시 draft로 되돌려
  블로그에서 내리는 것(unpublish)도 같은 토글로 지원한다.
- 배포 확인 다이얼로그에 이번 배포로 **공개/비공개가 바뀌는 게시물 목록**을 표시해,
  의도치 않은 공개를 방지한다.

사용자 워크플로: `npm run dev` → `/#/editor` 접속 → 새 글 작성(draft) → 저장을 반복하며 집필
→ 완성되면 게시(draft 해제) → 배포 버튼(git push) → GitHub Actions가 빌드·배포.

## 5. 라우팅 · 배포 설정

- `vite.config.ts`에 `base: '/nephthys-blog/'` 설정 (repo명 기준 Pages 경로).
- HashRouter 사용으로 새로고침/직접 접속 시 404 문제 원천 차단.
- `.github/workflows/deploy.yml`: master push 시 `npm ci → npm run build` →
  `actions/upload-pages-artifact` + `actions/deploy-pages`로 배포.
  (저장소 Settings → Pages → Source를 "GitHub Actions"로 설정 필요)

## 6. NieR 테마

`nier.jpeg` 기준 팔레트를 CSS 변수로 정의:

```css
:root {
  --nier-bg:        #cdc8b0;  /* 베이지 배경 */
  --nier-bg-dim:    #bab5a1;  /* 배경 음영/호버 */
  --nier-panel:     #dcd8c0;  /* 패널 본문 */
  --nier-dark:      #4c4a43;  /* 다크 패널/타이틀바/텍스트 */
  --nier-text:      #454138;  /* 본문 텍스트 */
  --nier-text-inv:  #dcd8c0;  /* 다크 패널 위 텍스트 */
  --nier-accent:    #b0aa94;  /* 라인/테두리 */
}
```

- 공용 `Panel` 컴포넌트: 다크 타이틀바 + 밝은 본문 (이미지의 Status/System/Weather 패널 형태).
- 배경: 얇은 그리드/대각선 라인, 하단 파형(waveform) 바 등 장식 요소를 CSS로 재현.
- 폰트: 본문 한글은 Noto Sans KR 계열, 숫자/영문 장식부는 monospace 계열.
- 호버/선택 효과: NieR 특유의 "텍스트-배경 반전" 인터랙션.
- 코드 블록·KaTeX 수식도 세피아 톤에 맞는 커스텀 스타일 적용.

## 7. 구현 단계

| 단계 | 내용 | 산출물 |
|---|---|---|
| 1. 기반 | 템플릿 정리, react-router 도입, 테마 변수·전역 CSS, AppFrame/TopBar/SideTabBar/Background | NieR 스타일 빈 레이아웃 |
| 2. 콘텐츠 파이프라인 | content/posts, build-posts 스크립트(draft 제외 포함), index.json, lib/posts.ts, 샘플 게시물 2~3개 | 정적 게시물 데이터 |
| 3. 게시물 뷰 | PostList/PostCard/PostViewer, MarkdownRenderer(GFM+KaTeX+하이라이팅), Home/Post/Tag 페이지 | 열람 가능한 블로그 |
| 4. 에디터 | Vite dev API 플러그인, EditorPage(편집/프리뷰/저장/배포, draft 관리·게시 토글) | 작성→배포 워크플로 |
| 5. 배포 | vite base 설정, GitHub Actions 워크플로, Pages 활성화 | 실서비스 URL |
| 6. 마감 | 장식 위젯, 반응형(모바일에서 탭바 접기), 성능 점검 | 완성본 |
| (차후) | @react-three/fiber 도입, Background/위젯을 3D Model Component로 교체 | 3D UI |

## 8. 기타 정리 사항

- `src/App.tsx`의 Vite 기본 템플릿 코드 제거.
- 루트의 빈 `Nephthys-Blog/` 폴더(잔여물) 삭제.
- `.gitignore`에 `.DS_Store` 추가 확인.
