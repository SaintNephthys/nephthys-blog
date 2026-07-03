import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  children: ReactNode
  className?: string
}

/** NieR 스타일 공용 패널: 다크 타이틀바 + 밝은 본문 */
function Panel({ title, children, className }: PanelProps) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      <h3 className="panel__title">{title}</h3>
      <div className="panel__body">{children}</div>
    </section>
  )
}

export default Panel
