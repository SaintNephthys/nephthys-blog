---
title: 작성 중인 글 (draft 예시)
date: 2026-07-03
tags: [meta]
summary: draft 상태의 게시물은 배포되어도 블로그에 노출되지 않는다.
draft: true
---

## 이 글은 초안이다

frontmatter에 `draft: true`가 설정되어 있으므로,

- `public/posts/index.json`에 포함되지 않고
- 본문 파일도 배포 산출물에 복사되지 않는다.

에디터에서 "게시" 버튼으로 draft를 해제한 뒤 배포하면 블로그에 공개된다.
