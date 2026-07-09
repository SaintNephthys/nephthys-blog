import { useId, useMemo, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import type { FnPlotSpec } from '../../../lib/graph'
import { integrate } from '../../../lib/graph/features/integral'
import { BASE_SAMPLES, sampleCurve } from '../../../lib/graph/sampling'
import { MARGIN } from './constants'
import { fmt } from './fmt'
import { useMeasuredWidth } from './useMeasuredWidth'

const AREA_SAMPLES = 400

interface IntegralData {
  lo: number
  hi: number
  value: number
  areaPath: string
}

interface PlotData {
  innerW: number
  innerH: number
  xScale: ReturnType<typeof scaleLinear<number, number>>
  yScale: ReturnType<typeof scaleLinear<number, number>>
  xTicks: number[]
  yTicks: number[]
  xFormat: (n: number) => string
  yFormat: (n: number) => string
  path: string
  integral: IntegralData | null
  /** param 추적점 (display.graph.point + point 식) — y는 비유한일 수 있다 */
  point: { x: number; y: number } | null
  /** 정의역 전체에서 유한한 함숫값이 하나도 없으면 true */
  allInvalid: boolean
}

function buildPlot(
  plot: FnPlotSpec,
  values: Record<string, number>,
  width: number,
  height: number,
): PlotData | null {
  const innerW = width - MARGIN.left - MARGIN.right
  const innerH = height - MARGIN.top - MARGIN.bottom
  if (innerW < 40) return null

  const [x0, x1] = plot.domain
  const env: Record<string, number> = { ...values, x: 0 }
  const evalAt = (x: number) => {
    env.x = x
    return plot.fn(env)
  }

  // 1차 균등 샘플링 — 자동 y 범위 추정용
  let yMin = Infinity
  let yMax = -Infinity
  for (let i = 0; i <= BASE_SAMPLES; i += 1) {
    const y = evalAt(x0 + ((x1 - x0) * i) / BASE_SAMPLES)
    if (Number.isFinite(y)) {
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
  }

  const allInvalid = yMin > yMax
  let yDomain: [number, number]
  if (plot.range) {
    yDomain = plot.range
  } else if (allInvalid) {
    yDomain = [-1, 1]
  } else if (yMin === yMax) {
    yDomain = [yMin - 1, yMax + 1]
  } else {
    const pad = (yMax - yMin) * 0.08
    yDomain = [yMin - pad, yMax + pad]
  }

  const xScale = scaleLinear().domain([x0, x1]).range([0, innerW])
  const yScale = scaleLinear().domain(yDomain).range([innerH, 0])
  if (!plot.range) yScale.nice()

  // nice() 반영 후의 최종 표시 범위 기준으로 곡선을 샘플링
  const [yLo, yHi] = yScale.domain() as [number, number]
  const points = allInvalid ? [] : sampleCurve(plot.fn, values, x0, x1, yLo, yHi)

  const gen = line<[number, number]>()
    .x((d) => xScale(d[0]))
    .y((d) => yScale(d[1]))
    .defined((d) => Number.isFinite(d[1]))

  // param 추적점 — 호버처럼 x·f(x)를 추적하되 구동원이 슬라이더(param 식)
  let point: { x: number; y: number } | null = null
  if (plot.display.graph.point && plot.point) {
    const pointX = plot.point(values)
    if (Number.isFinite(pointX)) point = { x: pointX, y: evalAt(pointX) }
  }

  // 적분 음영 + 수치 적분값 — 값(integral)·시각화(graph.integral) 어느 쪽도 안 쓰면 계산 생략
  let integral: IntegralData | null = null
  if (plot.integral && (plot.display.integral || plot.display.graph.integral)) {
    const lo = plot.integral.from(values)
    const hi = plot.integral.to(values)
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      const a = Math.min(lo, hi)
      const b = Math.max(lo, hi)
      const clampY = (y: number) =>
        Math.min(yHi + 2 * (yHi - yLo), Math.max(yLo - 2 * (yHi - yLo), y))
      const areaPoints: Array<[number, number]> = []
      for (let i = 0; i <= AREA_SAMPLES; i += 1) {
        const x = a + ((b - a) * i) / AREA_SAMPLES
        areaPoints.push([x, evalAt(x)])
      }
      const baseline = yScale(Math.min(yHi, Math.max(yLo, 0)))
      const areaGen = area<[number, number]>()
        .x((d) => xScale(d[0]))
        .y0(baseline)
        .y1((d) => yScale(clampY(d[1])))
        .defined((d) => Number.isFinite(d[1]))
      integral = {
        lo,
        hi,
        value: integrate(evalAt, lo, hi),
        areaPath: a === b ? '' : (areaGen(areaPoints) ?? ''),
      }
    } else {
      integral = { lo, hi, value: NaN, areaPath: '' }
    }
  }

  const xTickCount = Math.max(3, Math.min(10, Math.floor(innerW / 70)))
  return {
    innerW,
    innerH,
    xScale,
    yScale,
    xTicks: xScale.ticks(xTickCount),
    yTicks: yScale.ticks(6),
    xFormat: xScale.tickFormat(xTickCount),
    yFormat: yScale.tickFormat(6),
    path: gen(points) ?? '',
    integral,
    point,
    allInvalid,
  }
}

interface FnSubPlotProps {
  plot: FnPlotSpec
  values: Record<string, number>
  height: number
}

/**
 * kind = "fn" 서브플롯 — 자기 폭을 ResizeObserver로 실측하고(배치는 CSS grid 전담),
 * 호버 크로스헤어·readout·적분 음영·param 추적점을 display 스키마에 따라 렌더한다.
 */
function FnSubPlot({ plot, values, height }: FnSubPlotProps) {
  const clipId = useId()
  const [bodyRef, width] = useMeasuredWidth()
  const [hoverX, setHoverX] = useState<number | null>(null)

  const data = useMemo(
    () => buildPlot(plot, values, width, height),
    [plot, values, width, height],
  )

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!data) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left - MARGIN.left
    setHoverX(px >= 0 && px <= data.innerW ? data.xScale.invert(px) : null)
  }

  const hoverY = hoverX !== null ? plot.fn({ ...values, x: hoverX }) : null
  // x·f(x) readout의 추적 대상: 호버 중이면 호버 지점, 아니면 param 추적점
  const tracked = hoverX !== null ? { x: hoverX, y: hoverY ?? NaN } : (data?.point ?? null)

  return (
    <div ref={bodyRef} className="fngraph__subplot">
      {data && (
        <svg
          className="fngraph__svg"
          width={width}
          height={height}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverX(null)}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <clipPath id={clipId}>
              <rect width={data.innerW} height={data.innerH} />
            </clipPath>
            {data.xTicks.map((t) => (
              <line
                key={`x${t}`}
                className="fngraph__grid"
                x1={data.xScale(t)}
                x2={data.xScale(t)}
                y1={0}
                y2={data.innerH}
              />
            ))}
            {data.yTicks.map((t) => (
              <line
                key={`y${t}`}
                className={t === 0 ? 'fngraph__grid fngraph__grid--zero' : 'fngraph__grid'}
                x1={0}
                x2={data.innerW}
                y1={data.yScale(t)}
                y2={data.yScale(t)}
              />
            ))}
            <rect className="fngraph__frame" width={data.innerW} height={data.innerH} />
            {data.xTicks.map((t) => (
              <text
                key={`xl${t}`}
                className="fngraph__tick"
                x={data.xScale(t)}
                y={data.innerH + 18}
                textAnchor="middle"
              >
                {data.xFormat(t)}
              </text>
            ))}
            {data.yTicks.map((t) => (
              <text
                key={`yl${t}`}
                className="fngraph__tick"
                x={-8}
                y={data.yScale(t)}
                dy="0.32em"
                textAnchor="end"
              >
                {data.yFormat(t)}
              </text>
            ))}
            {data.allInvalid ? (
              <text
                className="fngraph__tick"
                x={data.innerW / 2}
                y={data.innerH / 2}
                textAnchor="middle"
              >
                정의역에서 유한한 함숫값이 없습니다
              </text>
            ) : (
              <g clipPath={`url(#${clipId})`}>
                {plot.display.graph.integral && data.integral && data.integral.areaPath && (
                  <path className="fngraph__area" d={data.integral.areaPath} />
                )}
                {plot.display.graph.integral &&
                  data.integral &&
                  Number.isFinite(data.integral.lo) &&
                  Number.isFinite(data.integral.hi) &&
                  [data.integral.lo, data.integral.hi].map((b, i) => (
                    <line
                      key={i === 0 ? 'lo' : 'hi'}
                      className="fngraph__bound"
                      x1={data.xScale(b)}
                      x2={data.xScale(b)}
                      y1={0}
                      y2={data.innerH}
                    />
                  ))}
                <path className="fngraph__curve" d={data.path} />
                {data.point && Number.isFinite(data.point.y) && (
                  <circle
                    className="fngraph__point"
                    cx={data.xScale(data.point.x)}
                    cy={data.yScale(data.point.y)}
                    r={4.5}
                  />
                )}
                {plot.display.x && hoverX !== null && (
                  <line
                    className="fngraph__cross"
                    x1={data.xScale(hoverX)}
                    x2={data.xScale(hoverX)}
                    y1={0}
                    y2={data.innerH}
                  />
                )}
                {plot.display.fx &&
                  hoverX !== null &&
                  hoverY !== null &&
                  Number.isFinite(hoverY) && (
                    <circle
                      className="fngraph__dot"
                      cx={data.xScale(hoverX)}
                      cy={data.yScale(hoverY)}
                      r={3.5}
                    />
                  )}
              </g>
            )}
          </g>
        </svg>
      )}
      {(plot.display.x || plot.display.fx || (plot.display.integral && data?.integral)) && (
        <div className="fngraph__readouts">
          {plot.display.x && (
            <div className="fngraph__readout">
              {`x = ${tracked ? fmt(tracked.x) : '—'}`}
            </div>
          )}
          {plot.display.fx && (
            <div className="fngraph__readout">
              {`f(x) = ${tracked ? fmt(tracked.y) : '—'}`}
            </div>
          )}
          {plot.display.integral && data?.integral && (
            <div className="fngraph__readout fngraph__readout--integral">
              {`∫ f dx  [${fmt(data.integral.lo)} → ${fmt(data.integral.hi)}]  =  ${fmt(data.integral.value)}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FnSubPlot
