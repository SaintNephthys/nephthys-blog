import { Fragment, useState } from 'react'
import { NavLink } from 'react-router-dom'
import FontSizeControl from '../widgets/FontSizeControl'
import { collectCategories } from '../../lib/posts'
import { usePostIndex } from '../../lib/usePostIndex'

export interface NavItem {
  label: string
  to: string
}

/** CATEGORIES 토글 버튼 + 펼쳐지는 카테고리 목록 (게시물 수 표시) */
function CategoryNav({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false)
  const { posts } = usePostIndex()
  const categories = collectCategories(posts)

  return (
    <>
      <button
        type="button"
        className="side-bar__item side-bar__item--button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        CATEGORIES
        <span className="count">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="side-bar__subnav">
          {categories.size === 0 && (
            <span className="side-bar__empty">- empty -</span>
          )}
          {[...categories.entries()].map(([category, count]) => (
            <NavLink
              key={category}
              to={`/category/${encodeURIComponent(category)}`}
              className={({ isActive }) =>
                `side-bar__subitem${isActive ? ' active' : ''}`
              }
              onClick={onNavigate}
            >
              {category}
              <span className="count">({count})</span>
            </NavLink>
          ))}
        </div>
      )}
    </>
  )
}

interface SideTabBarProps {
  items: NavItem[]
  open: boolean
  onNavigate: () => void
}

function SideTabBar({ items, open, onNavigate }: SideTabBarProps) {
  return (
    <nav className={`side-bar${open ? ' open' : ''}`}>
      <FontSizeControl />
      <div className="side-bar__header">MENU</div>
      <div className="side-bar__nav">
        {items.map((item) => (
          <Fragment key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `side-bar__item${isActive ? ' active' : ''}`
              }
              onClick={onNavigate}
            >
              {item.label}
            </NavLink>
            {/* HOME 바로 아래에 CATEGORIES 토글 배치 */}
            {item.label === 'HOME' && <CategoryNav onNavigate={onNavigate} />}
          </Fragment>
        ))}
      </div>
      <div className="side-bar__header">LINK</div>
      <div className="side-bar__nav">
        <a
          className="side-bar__item"
          href="https://github.com/SaintNephthys/nephthys-blog"
          target="_blank"
          rel="noreferrer"
        >
          GITHUB
        </a>
      </div>
    </nav>
  )
}

export default SideTabBar
