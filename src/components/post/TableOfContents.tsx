import { useMemo } from 'react'
import GithubSlugger from 'github-slugger'

interface TocEntry {
  text: string
  id: string
}

/**
 * 본문에서 H1(`# `) 헤더를 추출한다.
 * id는 rehype-slug와 동일한 github-slugger 규칙으로 생성해 앵커가 일치한다.
 */
function extractHeadings(content: string): TocEntry[] {
  const slugger = new GithubSlugger()
  const entries: TocEntry[] = []
  let inFence = false

  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^#\s+(.+?)\s*$/.exec(line)
    if (match) {
      // 인라인 서식 문법을 벗겨낸 순수 텍스트 기준으로 slug 생성
      const text = match[1].replace(/[*_`~]|<\/?u>/g, '')
      entries.push({ text, id: slugger.slug(text) })
    }
  }
  return entries
}

interface TableOfContentsProps {
  content: string
}

/** 게시물 우측의 목차 — 클릭 시 해당 섹션으로 스크롤 */
function TableOfContents({ content }: TableOfContentsProps) {
  const headings = useMemo(() => extractHeadings(content), [content])

  if (headings.length === 0) return null

  const jump = (id: string) => {
    // HashRouter와 충돌하지 않도록 URL 해시 대신 직접 스크롤한다
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav className="toc" aria-label="목차">
      <div className="toc__title">CONTENTS</div>
      <ul>
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault()
                jump(h.id)
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default TableOfContents
