import type { ReactNode } from 'react'

interface PageHeroProps {
  title: ReactNode
  subtitle?: ReactNode
}

/** 목록 페이지 상단 중앙 히어로 — 타이틀 + 모노 부제 (에디터의 .page-title과 별개) */
function PageHero({ title, subtitle }: PageHeroProps) {
  return (
    <header className="page-hero">
      <h1 className="page-hero__title">{title}</h1>
      {subtitle && <p className="page-hero__subtitle">{subtitle}</p>}
    </header>
  )
}

export default PageHero
