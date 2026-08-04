import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import FontSizeControl from '../widgets/FontSizeControl'
import ThemeToggle from '../widgets/ThemeToggle'
import type { ThemeId } from '../../lib/theme'

/* 세그먼트 내비 아이콘 — stroke가 currentColor라 항목 상태 색을 그대로 따르고,
   선 마감(cap/join)은 CSS가 테마별로 바꾼다(CITYRUIN 각짐 / TOKYOSKY 라운드) */
const NAV_ICONS: Record<string, React.ReactNode> = {
  // 집 — 지붕 + 몸체
  HOME: (
    <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 8.4 8 3.4l5.5 5M4.2 7.8V13h7.6V7.8M6.7 13v-3h2.6v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  // 문서 — 종이 + 글줄
  POST: (
    <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 2.5h8v11H4zM6.2 5.5h3.6M6.2 8h3.6M6.2 10.5h2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  // 꼬리표 — 태그 몸체 + 구멍
  TAGS: (
    <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.7 2.7h5L13.3 8.3 8.3 13.3 2.7 7.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="5.6" cy="5.6" r="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  // 연필 — 획 + 촉
  EDITOR: (
    <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M10.6 3.2l2.2 2.2L6 12.2l-3 .8.8-3zM9.4 4.4l2.2 2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
}

const NAV_ITEMS = [
  { label: 'HOME', to: '/' },
  { label: 'POST', to: '/posts' },
  { label: 'TAGS', to: '/tags' },
  // 에디터는 로컬 dev 전용 페이지 — 배포된 사이트의 메뉴에는 노출하지 않는다
  ...(import.meta.env.DEV ? [{ label: 'EDITOR', to: '/editor' }] : []),
]

const GITHUB_URL = 'https://github.com/SaintNephthys/nephthys-blog'

/** 한 번에 하나만 열리는 상단바 부속 패널 */
type PanelId = 'search' | 'settings' | 'menu'

interface TopBarProps {
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
}

/**
 * 단일 상단 크롬 — 로고 + 세그먼트 내비(1024px 이상) + GITHUB 외부 링크 chip +
 * ⌕ 검색 + ◐ 화면 설정. GITHUB는 사이트 내비와 성격이 달라 세그먼트에서 분리해
 * 우측에 배치한다. 1024px 미만에서는 내비·외부 링크가 햄버거 메뉴 패널로 접힌다.
 * 모든 패널은 스크림 바깥 클릭으로 닫힌다.
 */
function TopBar({ theme, onThemeChange }: TopBarProps) {
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState<PanelId | null>(null)
  const navigate = useNavigate()

  const toggle = (id: PanelId) => setPanel((cur) => (cur === id ? null : id))
  const close = () => setPanel(null)

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    close()
    navigate(`/search/${encodeURIComponent(q)}`)
  }

  // 아이콘은 세그먼트 내비 전용 — 모바일 메뉴 패널은 마름모 불릿 문법을 유지한다
  const navLinks = (className: string, onNavigate?: () => void, withIcons = false) =>
    NAV_ITEMS.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) => `${className}${isActive ? ' active' : ''}`}
        onClick={onNavigate}
      >
        {withIcons && NAV_ICONS[item.label]}
        {item.label}
      </NavLink>
    ))

  return (
    <>
      <header className="top-bar">
        <button
          type="button"
          className="top-bar__icon top-bar__menu"
          onClick={() => toggle('menu')}
          aria-label="메뉴 열기"
          aria-expanded={panel === 'menu'}
        >
          ≡
        </button>
        <Link to="/" className="top-bar__logo">
          <span className="top-bar__logo-mark" aria-hidden="true" />
          <span className="top-bar__logo-text">NEPHTHYS BLOG</span>
        </Link>
        <nav className="top-nav" aria-label="주 메뉴">
          {navLinks('top-nav__item', undefined, true)}
        </nav>
        <div className="top-bar__spacer" />
        <a className="top-bar__ext" href={GITHUB_URL} target="_blank" rel="noreferrer">
          GITHUB
        </a>
        <button
          type="button"
          className="top-bar__icon"
          onClick={() => toggle('search')}
          aria-label={panel === 'search' ? '검색 닫기' : '검색 열기'}
          aria-expanded={panel === 'search'}
        >
          ⌕
        </button>
        <button
          type="button"
          className="top-bar__icon"
          onClick={() => toggle('settings')}
          aria-label={panel === 'settings' ? '화면 설정 닫기' : '화면 설정 열기'}
          aria-expanded={panel === 'settings'}
        >
          ◐
        </button>
      </header>
      {panel === 'search' && (
        <>
          <button type="button" className="scrim scrim--clear" onClick={close} aria-label="검색 닫기" />
          <form className="top-bar__search-drop" onSubmit={submitSearch} role="search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH…"
              aria-label="게시물 검색"
              autoFocus
            />
          </form>
        </>
      )}
      {panel === 'settings' && (
        <>
          <button type="button" className="scrim scrim--clear" onClick={close} aria-label="화면 설정 닫기" />
          <div className="top-pop">
            <p className="top-pop__label">THEME</p>
            <ThemeToggle theme={theme} onChange={onThemeChange} />
            <p className="top-pop__label">FONT SIZE</p>
            <FontSizeControl />
          </div>
        </>
      )}
      {panel === 'menu' && (
        <>
          <button type="button" className="scrim" onClick={close} aria-label="메뉴 닫기" />
          <nav className="top-menu" aria-label="주 메뉴">
            {navLinks('top-menu__item', close)}
            <a
              className="top-menu__item top-menu__item--ext"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              GITHUB
            </a>
          </nav>
        </>
      )}
    </>
  )
}

export default TopBar
