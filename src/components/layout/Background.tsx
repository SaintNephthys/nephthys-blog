/**
 * 배경 장식 레이어 (reference-files/nier_theme.jpeg 기반).
 * 좌우 비네트·격자는 CSS(.bg-layer)가, 모서리의 원·직선 도형은 SVG가 담당한다.
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

function Background() {
  return (
    <div className="bg-layer" aria-hidden="true">
      <CornerFigure className="bg-figure bg-figure--tl" />
      <CornerFigure className="bg-figure bg-figure--br" />
    </div>
  )
}

export default Background
