import { THEME_LABELS, type ThemeId } from '../../lib/theme'

interface ThemeToggleProps {
  theme: ThemeId
  onChange: (theme: ThemeId) => void
}

/** 테마 전환 세그먼트 토글 (side-bar 상단, font-control 위) */
function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <div className="theme-control" role="group" aria-label="테마 선택">
      {(Object.keys(THEME_LABELS) as ThemeId[]).map((id) => (
        <button
          key={id}
          type="button"
          className={theme === id ? 'active' : undefined}
          aria-pressed={theme === id}
          onClick={() => onChange(id)}
        >
          {THEME_LABELS[id]}
        </button>
      ))}
    </div>
  )
}

export default ThemeToggle
