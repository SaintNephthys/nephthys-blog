import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * 구역의 실측 폭 — 배치는 CSS grid 전담, SVG는 실측 px로 그린다(rem 규칙 유지).
 * setWidth는 ResizeObserver 콜백 안 — ESLint set-state-in-effect 회피.
 */
export function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
