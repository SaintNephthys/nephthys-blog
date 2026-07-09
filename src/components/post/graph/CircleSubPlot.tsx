import { useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import type { CirclePlotSpec } from '../../../lib/graph'
import { MARGIN } from './constants'
import { fmt } from './fmt'
import { useMeasuredWidth } from './useMeasuredWidth'

/** 원 표시 범위 — 반지름 1의 단위원이 눈금과 함께 들어가는 짧은 축 반폭 */
const CIRCLE_EXTENT = 1.25

interface CircleSubPlotProps {
  plot: CirclePlotSpec
  values: Record<string, number>
  height: number
}

/**
 * kind = "circle" 서브플롯 — 단위원 + param 각도를 따라 회전하는 반지름.
 * px-per-unit은 짧은 축 기준으로 등화(긴 축의 정의역을 늘림) — 아니면 원이
 * 타원으로 찌그러지거나 좁은 셀에서 frame을 넘는다. display 항목이 반지름·끝점
 * (theta), 축 사영 점선(cos·sin)과 대응 readout을 쌍으로 제어한다.
 */
function CircleSubPlot({ plot, values, height }: CircleSubPlotProps) {
  const [bodyRef, width] = useMeasuredWidth()

  const data = useMemo(() => {
    const innerW = width - MARGIN.left - MARGIN.right
    const innerH = height - MARGIN.top - MARGIN.bottom
    if (innerW < 40 || innerH < 40) return null
    // px-per-unit은 짧은 축 기준 — 긴 축의 정의역을 늘려 원이 어느 방향으로도
    // frame을 넘지 않게 한다 (세로 기준 고정 방식은 좁은 셀에서 원이 가로로 넘쳤음)
    const ppu = Math.min(innerW, innerH) / (2 * CIRCLE_EXTENT)
    const xHalf = innerW / (2 * ppu)
    const yHalf = innerH / (2 * ppu)
    const xScale = scaleLinear().domain([-xHalf, xHalf]).range([0, innerW])
    const yScale = scaleLinear().domain([-yHalf, yHalf]).range([innerH, 0])
    return {
      innerW,
      innerH,
      xScale,
      yScale,
      r: ppu,
      xTicks: xScale.ticks(Math.max(3, Math.min(7, Math.floor(innerW / 60)))),
      yTicks: yScale.ticks(5),
      xFormat: xScale.tickFormat(5),
      yFormat: yScale.tickFormat(5),
    }
  }, [width, height])

  const theta = plot.angle(values)
  const ok = Number.isFinite(theta)
  const px = ok ? Math.cos(theta) : 0
  const py = ok ? Math.sin(theta) : 0
  const deg = ok ? (theta * 180) / Math.PI : NaN

  return (
    <div ref={bodyRef} className="fngraph__subplot">
      {data && (
        <svg className="fngraph__svg" width={width} height={height}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {data.xTicks.map((t) => (
              <line
                key={`x${t}`}
                className={t === 0 ? 'fngraph__grid fngraph__grid--zero' : 'fngraph__grid'}
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
            <circle
              className="fngraph__curve"
              cx={data.xScale(0)}
              cy={data.yScale(0)}
              r={data.r}
            />
            {ok && (
              <>
                {/* 끝점 → x축 사영(끝점의 x좌표 = cos θ) */}
                {plot.display.cos && (
                  <line
                    className="fngraph__cross"
                    x1={data.xScale(px)}
                    y1={data.yScale(py)}
                    x2={data.xScale(px)}
                    y2={data.yScale(0)}
                  />
                )}
                {/* 끝점 → y축 사영(끝점의 y좌표 = sin θ) */}
                {plot.display.sin && (
                  <line
                    className="fngraph__cross"
                    x1={data.xScale(px)}
                    y1={data.yScale(py)}
                    x2={data.xScale(0)}
                    y2={data.yScale(py)}
                  />
                )}
                {plot.display.theta && (
                  <>
                    <line
                      className="fngraph__radius"
                      x1={data.xScale(0)}
                      y1={data.yScale(0)}
                      x2={data.xScale(px)}
                      y2={data.yScale(py)}
                    />
                    <circle
                      className="fngraph__dot"
                      cx={data.xScale(px)}
                      cy={data.yScale(py)}
                      r={4}
                    />
                  </>
                )}
              </>
            )}
          </g>
        </svg>
      )}
      {(plot.display.theta || plot.display.cos || plot.display.sin) && (
        <div className="fngraph__readouts">
          {plot.display.theta && (
            <div className="fngraph__readout">{`θ = ${ok ? `${fmt(deg)}°` : '—'}`}</div>
          )}
          {plot.display.cos && (
            <div className="fngraph__readout">{`cos θ = ${ok ? fmt(px) : '—'}`}</div>
          )}
          {plot.display.sin && (
            <div className="fngraph__readout">{`sin θ = ${ok ? fmt(py) : '—'}`}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default CircleSubPlot
