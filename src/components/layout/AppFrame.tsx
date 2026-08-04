import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Background from './Background'
import TopBar from './TopBar'
import { applyTheme, loadTheme, type ThemeId } from '../../lib/theme'

/** 카드 그리드 캔버스(넓은 목록 폭)를 쓰는 라우트 판별 */
function isGridRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/posts' ||
    pathname === '/tags' ||
    pathname.startsWith('/category/') ||
    pathname.startsWith('/tag/') ||
    pathname.startsWith('/search/')
  )
}

/**
 * 전체 레이아웃 골격 — 단일 상단 크롬 + 중앙 정렬 본문.
 * 배경(0) / 콘텐츠(1) / 상단바(20) z-index 레이어를 분리해 두어,
 * 차후 Background를 Three.js Canvas로 교체할 수 있다.
 */
function AppFrame() {
  const [theme, setTheme] = useState<ThemeId>(loadTheme)
  const location = useLocation()
  // 에디터는 폼/프리뷰 2열 구성이므로 본문 폭 제한 없이 화면 전체를 쓴다
  const wide = location.pathname.startsWith('/editor')
  const grid = isGridRoute(location.pathname)
  const post = location.pathname.startsWith('/post/')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const contentClass = [
    'app-content',
    wide ? 'app-content--wide' : '',
    grid ? 'app-content--grid' : '',
    post ? 'app-content--post' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="app">
      <Background theme={theme} />
      <TopBar theme={theme} onThemeChange={setTheme} />
      <div className="app-body">
        <main className={contentClass} key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppFrame
