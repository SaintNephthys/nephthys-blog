import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import FontSizeControl from '../widgets/FontSizeControl'
import ThemeToggle from '../widgets/ThemeToggle'
import type { ThemeId } from '../../lib/theme'

const NAV_ITEMS = [
  { label: 'HOME', to: '/' },
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
 * 단일 상단 크롬 — 로고 + 세그먼트 내비(1024px 이상) + ⌕ 검색 + ◐ 화면 설정.
 * 1024px 미만에서는 내비가 햄버거 메뉴 패널로 접힌다. 모든 패널은 스크림
 * 바깥 클릭으로 닫힌다.
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

  const navLinks = (className: string, onNavigate?: () => void) => (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `${className}${isActive ? ' active' : ''}`}
          onClick={onNavigate}
        >
          {item.label}
        </NavLink>
      ))}
      <a className={className} href={GITHUB_URL} target="_blank" rel="noreferrer">
        GITHUB
      </a>
    </>
  )

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
          NEPHTHYS BLOG
        </Link>
        <nav className="top-nav" aria-label="주 메뉴">
          {navLinks('top-nav__item')}
        </nav>
        <div className="top-bar__spacer" />
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
          </nav>
        </>
      )}
    </>
  )
}

export default TopBar
