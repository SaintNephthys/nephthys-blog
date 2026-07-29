import { useEffect, useMemo, useState } from 'react'
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

/** 게시물 우측의 목차 — 클릭 시 해당 섹션으로 스크롤, 현재 보는 섹션은 볼드 표시 */
function TableOfContents({ content }: TableOfContentsProps) {
  const headings = useMemo(() => extractHeadings(content), [content])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const topbarH =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'),
      ) || 52

    const compute = () => {
      const doc = document.documentElement
      // 문서 끝에서는 화면 상단에 닿지 못하는 마지막 섹션을 현재로 취급
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
        setActiveId(headings.length > 0 ? headings[headings.length - 1].id : null)
        return
      }
      // 헤더의 scroll-margin-top(topbar+16px)으로 정렬된 위치가 포함되도록 여유를 둔다
      const threshold = topbarH + 24
      let current: string | null = null
      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= threshold) current = h.id
        else break
      }
      setActiveId(current)
    }

    const raf = requestAnimationFrame(compute)
    window.addEventListener('scroll', compute, { passive: true })
    window.addEventListener('resize', compute)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', compute)
      window.removeEventListener('resize', compute)
    }
  }, [headings])

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
              aria-current={activeId === h.id ? 'location' : undefined}
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
