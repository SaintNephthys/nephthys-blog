---
title: 이미지 삽입 테스트
date: '2026-07-07'
tags:
  - test
  - image
summary: 에디터 이미지 업로드 파이프라인 테스트 게시물
category: Dev
---
# 이미지 삽입

에디터에 붙여넣기·드래그&드롭 또는 IMG 버튼으로 업로드한 이미지는 WebP(q80, 최대 폭 1600px)로 변환되어 게시물별 디렉터리에 저장된다.

![테스트 이미지](test_img.webp)

- 원본: `test_img.png` 3161×1055, 4.3MB
- 변환: `test_img.webp` 1600×534

# 상대 크기 표시

alt 끝에 `|NN`(1~100)을 붙이면 **브라우저 기본 표시 크기**(컨테이너에 맞춰진 크기) 대비 상대 크기로 표시된다. 예: 1600px 이미지가 1200px로 표시되는 화면에서 `|50`은 600px.

`![테스트 이미지|50](test_img.webp)` — 표시 크기의 50%:

![테스트 이미지|50](test_img.webp)

`![테스트 이미지|20](test_img.webp)` — 표시 크기의 20%:

![테스트 이미지|20](test_img.webp)

# 참조 규칙

본문에는 파일명만 쓴다 — 렌더러가 게시물 이미지 디렉터리 기준으로 해석한다.

- 상대 참조 `![](test_img.webp)` → `posts/images/<slug>/test_img.webp`
- 외부 URL과 절대 경로는 그대로 유지된다
- SAVE·PUBLISH·DEPLOY 시 본문이 참조하지 않는 이미지는 자동 삭제된다

# 격리 확인

draft 상태에서는 본문과 이미지 모두 `content/drafts/`(gitignore)에 있어 저장소에 올라가지 않으며, PUBLISH 시 커밋 영역(`content/posts/`, `content/images/`)으로 이동한다.
