import type { ThemeId } from '../../lib/theme'

/**
 * 배경 장식 레이어 — 테마별 변형.
 * - cityruin: nier_theme.jpeg 기반 비네트·격자(CSS) + 모서리 원호 도형(SVG)
 * - tokyosky: newtheme.jpg 기반 하늘 그라데이션(CSS) + 선화 SVG(화면 상단에 크게
 *   걸친 스파이어 헤일로 링 + 2겹 스카이라인) — 두 테마 모두 "선으로 이루어진" 장식 원칙 공유
 * 차후 Three.js 도입 시 이 컴포넌트를 R3F Canvas 버전으로 교체한다.
 */

/** 이중 원호 + 45° 평행선 도형 — 우하단 기준으로 그려져 있고, 좌상단은 180° 회전으로 재사용 */
function CornerFigure({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 960 960" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.25" fill="none">
        <circle cx="1040" cy="1020" r="535" vectorEffect="non-scaling-stroke" />
        <circle cx="1040" cy="1020" r="520" vectorEffect="non-scaling-stroke" />
        <line x1="-20" y1="-20" x2="980" y2="980" vectorEffect="non-scaling-stroke" />
        <line x1="150" y1="-20" x2="980" y2="810" vectorEffect="non-scaling-stroke" />
        <line x1="-20" y1="120" x2="860" y2="1000" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}

/** 건물 상단 y 좌표 시드 → 계단형 스카이라인 path (값이 작을수록 높은 건물) */
function skylinePath(tops: number[], base: number, width: number): string {
  const step = width / tops.length
  let d = `M0 ${base} L0 ${tops[0]}`
  for (let i = 0; i < tops.length; i++) {
    d += ` H${((i + 1) * step).toFixed(1)}`
    if (i < tops.length - 1) d += ` V${tops[i + 1]}`
  }
  return d + ` V${base}`
}

const BACK_TOPS = [150, 108, 160, 92, 138, 118, 156, 84, 130, 100, 148, 112]
const FRONT_TOPS = [196, 120, 172, 88, 152, 108, 180, 68, 142, 186]
const SKYLINE_W = 1600
const SKYLINE_BASE = 240

/** 22세기 도쿄 스카이라인 — 2겹 계단 선화 + 고층 건물 안테나 */
function TokyoSkyline() {
  const step = SKYLINE_W / FRONT_TOPS.length
  return (
    <svg
      className="bg-tokyo__skyline"
      viewBox={`0 0 ${SKYLINE_W} ${SKYLINE_BASE}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" fill="none">
        <path
          d={skylinePath(BACK_TOPS, SKYLINE_BASE, SKYLINE_W)}
          strokeOpacity="0.45"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={skylinePath(FRONT_TOPS, SKYLINE_BASE, SKYLINE_W)}
          strokeOpacity="0.9"
          vectorEffect="non-scaling-stroke"
        />
        {/* 안테나 — 충분히 높은 건물(top < 100) 지붕 중앙에 세운다 */}
        {FRONT_TOPS.map((top, i) =>
          top < 100 ? (
            <line
              key={i}
              x1={(i + 0.5) * step}
              y1={top}
              x2={(i + 0.5) * step}
              y2={top - 22}
              strokeOpacity="0.9"
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
      </g>
    </svg>
  )
}

/**
 * 중앙 스파이어 + 동심 헤일로 링 3개 (newtheme.jpg의 핵심 모티프).
 * 16:9 viewBox — CSS가 뷰포트보다 크게(150vw) 확대해 화면 상단에 걸치므로
 * 링들이 화면 밖으로 벗어나며 잘린다.
 */
function TokyoHalo() {
  return (
    <svg className="bg-tokyo__halo" viewBox="0 0 1600 900" aria-hidden="true">
      <g stroke="currentColor" fill="none">
        <line x1="800" y1="900" x2="800" y2="96" vectorEffect="non-scaling-stroke" />
        <circle cx="800" cy="82" r="12" vectorEffect="non-scaling-stroke" />
        <ellipse cx="800" cy="240" rx="300" ry="68" strokeOpacity="0.8" vectorEffect="non-scaling-stroke" />
        <ellipse cx="800" cy="252" rx="520" ry="118" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
        <ellipse cx="800" cy="266" rx="760" ry="172" strokeOpacity="0.3" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}

function Background({ theme }: { theme: ThemeId }) {
  if (theme === 'tokyosky') {
    return (
      <div className="bg-layer bg-layer--tokyo" aria-hidden="true">
        <TokyoHalo />
        <TokyoSkyline />
      </div>
    )
  }
  return (
    <div className="bg-layer" aria-hidden="true">
      <CornerFigure className="bg-figure bg-figure--tl" />
      <CornerFigure className="bg-figure bg-figure--br" />
    </div>
  )
}

export default Background
