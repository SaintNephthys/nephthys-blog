import { useEffect, useState } from 'react'

const STORAGE_KEY = 'nephthys-font-size'
const DEFAULT_SIZE = 16
const MIN_SIZE = 12
const MAX_SIZE = 22

function loadSize(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(saved) && saved >= MIN_SIZE && saved <= MAX_SIZE
    ? saved
    : DEFAULT_SIZE
}

/**
 * 블로그 전체 글씨 크기 조절.
 * 모든 font-size가 rem 단위이므로 루트 font-size만 바꾸면 전체가 함께 조절된다.
 * 가운데 버튼(%)을 누르면 기본 크기로 돌아간다.
 */
function FontSizeControl() {
  const [size, setSize] = useState(loadSize)

  useEffect(() => {
    document.documentElement.style.fontSize = `${size}px`
    localStorage.setItem(STORAGE_KEY, String(size))
  }, [size])

  return (
    <div className="font-control" role="group" aria-label="글씨 크기 조절">
      <button
        type="button"
        disabled={size <= MIN_SIZE}
        onClick={() => setSize((s) => Math.max(MIN_SIZE, s - 1))}
        title="글씨 작게"
      >
        A−
      </button>
      <button
        type="button"
        onClick={() => setSize(DEFAULT_SIZE)}
        title="기본 크기로"
      >
        {Math.round((size / DEFAULT_SIZE) * 100)}%
      </button>
      <button
        type="button"
        disabled={size >= MAX_SIZE}
        onClick={() => setSize((s) => Math.min(MAX_SIZE, s + 1))}
        title="글씨 크게"
      >
        A+
      </button>
    </div>
  )
}

export default FontSizeControl
