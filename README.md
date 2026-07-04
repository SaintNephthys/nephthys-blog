# Nephthys Blog

수학·과학·코드를 다루는 개인 블로그. NieR:Automata UI 테마.
React 19 + Vite + TypeScript, GitHub Pages 호스팅.

**Live**: https://saintnephthys.github.io/nephthys-blog/

## 주요 기능

- **게시물**: Markdown + KaTeX 수식 + 코드 하이라이팅(NieR Automata Light 색상, hover 시 언어명·COPY 버튼) + GFM 표
- **탐색**: 카테고리(사이드바 펼침 메뉴)·태그·검색(제목/태그/헤더/구분점), 게시물 우측 CONTENTS 목차(H1 기준)
- **에디터** (`/#/editor`, 로컬 dev 전용): 작성 → 저장 → 게시(draft 해제) → 배포(git push)를 한 페이지에서.
  Markdown 서식 도구바, 실시간 프리뷰, 카테고리 드롭다운, 배포 전 공개 상태 변화 확인 다이얼로그
- **draft**: 초안은 `content/drafts/`(gitignore)에 저장되어 저장소에 아예 올라가지 않음 — PUBLISH 시 `content/posts/`로 이동
- 글씨 크기 조절(사이드바 A−/A+), 반응형 레이아웃

## 개발

```bash
npm install
npm run dev        # dev 서버 + 에디터 API (http://localhost:5173/nephthys-blog/)
npm run build      # 게시물 인덱스 생성 → 타입체크 → 프로덕션 빌드
npm run lint
```

## 글 쓰기

1. `npm run dev` 실행 후 `/#/editor` 접속 (또는 `content/posts/*.md` 직접 편집)
2. frontmatter: `title, date, category, tags, summary, draft`
3. 본문 최상위 섹션은 `#`(H1) — 우측 목차가 H1을 인식한다
4. 완성되면 PUBLISH(draft 해제) → DEPLOY(git push) → GitHub Actions가 자동 배포

## 배포

master에 push하면 `.github/workflows/deploy.yml`이 빌드 후 GitHub Pages로 배포한다.
저장소 Settings → Pages → Source를 **GitHub Actions**로 설정해야 한다.

## 문서

- 아키텍처·구현 이력: [docs/implementation-plan.md](docs/implementation-plan.md)
- 개발 가이드(Claude Code용): [CLAUDE.md](CLAUDE.md)
