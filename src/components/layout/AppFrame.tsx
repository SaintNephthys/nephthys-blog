import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Background from './Background'
import TopBar from './TopBar'
import SideTabBar, { type NavItem } from './SideTabBar'

const NAV_ITEMS: NavItem[] = [
  { label: 'HOME', to: '/' },
  { label: 'TAGS', to: '/tags' },
  // 에디터는 로컬 dev 전용 페이지 — 배포된 사이트의 메뉴에는 노출하지 않는다
  ...(import.meta.env.DEV ? [{ label: 'EDITOR', to: '/editor' }] : []),
]

/**
 * 전체 레이아웃 골격.
 * 배경(0) / 콘텐츠(1) / 상단바(20) z-index 레이어를 분리해 두어,
 * 차후 Background를 Three.js Canvas로 교체할 수 있다.
 */
function AppFrame() {
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  // 에디터는 폼/프리뷰 2열 구성이므로 본문 폭 제한 없이 화면 전체를 쓴다
  const wide = location.pathname.startsWith('/editor')

  return (
    <div className="app">
      <Background />
      <TopBar onToggleNav={() => setNavOpen((open) => !open)} />
      <div className="app-body">
        <SideTabBar
          items={NAV_ITEMS}
          open={navOpen}
          onNavigate={() => setNavOpen(false)}
        />
        <main
          className={`app-content${wide ? ' app-content--wide' : ''}`}
          key={location.pathname}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppFrame
