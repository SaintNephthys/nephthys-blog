import { NavLink } from 'react-router-dom'

export interface NavItem {
  label: string
  to: string
}

interface SideTabBarProps {
  items: NavItem[]
  open: boolean
  onNavigate: () => void
}

function SideTabBar({ items, open, onNavigate }: SideTabBarProps) {
  return (
    <nav className={`side-bar${open ? ' open' : ''}`}>
      <div className="side-bar__header">MENU</div>
      <div className="side-bar__nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `side-bar__item${isActive ? ' active' : ''}`
            }
            onClick={onNavigate}
          >
            {item.label}
          </NavLink>
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
