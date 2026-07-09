import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface TopBarProps {
  onToggleNav: () => void
}

function TopBar({ onToggleNav }: TopBarProps) {
  const [query, setQuery] = useState('')
  // 모바일 전용 드롭다운 검색창 — 데스크톱 인라인 검색과 CSS로 상호 배타 노출
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearchOpen(false)
    navigate(`/search/${encodeURIComponent(q)}`)
  }

  return (
    <header className="top-bar">
      <button
        type="button"
        className="top-bar__menu"
        onClick={onToggleNav}
        aria-label="메뉴 열기"
      >
        ≡
      </button>
      <Link to="/" className="top-bar__logo">
        <span className="top-bar__logo-mark" aria-hidden="true" />
        NEPHTHYS BLOG
      </Link>
      <div className="top-bar__spacer" />
      <form className="top-bar__search" onSubmit={submitSearch} role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH…"
          aria-label="게시물 검색"
        />
      </form>
      <button
        type="button"
        className="top-bar__search-toggle"
        onClick={() => setSearchOpen((open) => !open)}
        aria-label={searchOpen ? '검색 닫기' : '검색 열기'}
        aria-expanded={searchOpen}
      >
        ⌕
      </button>
      {searchOpen && (
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
      )}
    </header>
  )
}

export default TopBar
