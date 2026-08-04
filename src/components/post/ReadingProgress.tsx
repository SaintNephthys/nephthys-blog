import { useEffect, useState } from 'react'

/**
 * 읽기 진행률 바 — 상단바 바로 아래 얇은 게이지.
 * 페이지 스크롤 비율(0~1)을 scaleX로 표시한다(리플로 없는 transform).
 */
function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const compute = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
    }

    const raf = requestAnimationFrame(compute)
    window.addEventListener('scroll', compute, { passive: true })
    window.addEventListener('resize', compute)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', compute)
      window.removeEventListener('resize', compute)
    }
  }, [])

  return (
    <div
      className="read-progress"
      style={{ transform: `scaleX(${progress})` }}
      aria-hidden="true"
    />
  )
}

export default ReadingProgress
