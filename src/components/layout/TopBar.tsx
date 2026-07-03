import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface TopBarProps {
  onToggleNav: () => void
}

function TopBar({ onToggleNav }: TopBarProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const date = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

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
      <div className="top-bar__clock">
        <strong>{time}</strong>
        {date}
      </div>
    </header>
  )
}

export default TopBar
