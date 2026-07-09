import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import {
  parseGraphSpec,
  type CirclePlotSpec,
  type FnPlotSpec,
  type GraphParam,
  type PlotSpec,
} from '../../lib/graphSpec'
import type { EvalFn } from '../../lib/mathExpr'

/**
 * ```graph 코드 펜스가 렌더되는 인터랙티브 함수 그래프.
 * D3는 수학(스케일·눈금·경로 생성)만 담당하고 SVG 렌더링은 React가 한다 —
 * DOM 소유권을 React에 남겨 두 라이브러리의 충돌을 원천 차단.
 *
 * 다중 서브플롯: [[plot]] 1~4개가 작성 순서대로 배치된다(2개: 2×1, 3~4개: 2×2 —
 * 3개면 넷째 칸은 빈 칸). 모든 서브플롯은 [params] 슬라이더 한 세트에 동기화된다.
 * 각 서브플롯(SubPlot)이 자기 폭을 ResizeObserver로 실측하므로 배치는 CSS grid가
 * 전담하고, viewBox 스케일링 없이 SVG 텍스트가 rem 규칙을 따른다.
 */

const PLOT_HEIGHT = 300
const SUB_PLOT_HEIGHT = 240
const MARGIN = { top: 14, right: 18, bottom: 30, left: 54 }
const BASE_SAMPLES = 800
/** 적응형 세분 최대 깊이 — 문제 구간의 국소 밀도가 기본의 2^6배까지 올라간다 */
const MAX_REFINE_DEPTH = 6
const AREA_SAMPLES = 400
const SIMPSON_STEPS = 1000

/** 값 표시용 포맷 — 유효자리 유지하되 부동소수 노이즈 제거 */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e6 || a < 1e-4)) return v.toExponential(3)
  return String(Number(v.toFixed(4)))
}

/**
 * 적응형 곡선 샘플링 — 인접 샘플의 y 변화가 표시 범위(span)를 넘으면 구간을
 * 재귀 세분한다. 연속이지만 가파른 구간은 점이 촘촘해져 매끄럽게 이어지고,
 * 발산하는 구간(점근선)은 최대 깊이에서도 간극이 남아 NaN 마커로 확실히 끊는다.
 *
 * 슬라이더로 극점이 샘플 격자 사이를 지날 때 스파이크가 그려졌다/안 그려졌다
 * 하며 깜빡이던 문제의 해결책: 판정이 격자 위치가 아니라 함수의 발산 여부로
 * 내려지므로 프레임마다 결과가 일관된다. 유한하지만 거대한 값은 표시 범위의
 * ±2배로 클램프해 좌표 폭주 없이 분기 끝이 안정적으로 화면 밖까지 이어진다.
 */
function sampleCurve(
  fn: EvalFn,
  values: Record<string, number>,
  x0: number,
  x1: number,
  yLo: number,
  yHi: number,
): Array<[number, number]> {
  const env: Record<string, number> = { ...values, x: 0 }
  const evalAt = (x: number) => {
    env.x = x
    return fn(env)
  }
  const span = yHi - yLo
  const jumpLimit = span
  const clampLo = yLo - 2 * span
  const clampHi = yHi + 2 * span
  const points: Array<[number, number]> = []
  const push = (x: number, y: number) =>
    points.push([x, Number.isFinite(y) ? Math.min(clampHi, Math.max(clampLo, y)) : NaN])

  const segment = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    const aFinite = Number.isFinite(ya)
    const bFinite = Number.isFinite(yb)
    if (aFinite && bFinite && Math.abs(yb - ya) <= jumpLimit) {
      push(xb, yb)
      return
    }
    // 양끝 다 무효(정의역 밖 구간)면 세분해도 얻을 게 없다
    if (!aFinite && !bFinite) {
      push(xb, yb)
      return
    }
    // 양끝이 같은 쪽 클램프 밖이면 잇는 선분 전체가 화면 밖 — 세분 불필요.
    // 극점 주변의 가파른 offscreen 구간에서 gap이 수십 개 생기는 것을 막는다
    if (
      aFinite &&
      bFinite &&
      ((ya > clampHi && yb > clampHi) || (ya < clampLo && yb < clampLo))
    ) {
      push(xb, yb)
      return
    }
    if (depth >= MAX_REFINE_DEPTH) {
      points.push([(xa + xb) / 2, NaN])
      push(xb, yb)
      return
    }
    const xm = (xa + xb) / 2
    const ym = evalAt(xm)
    segment(xa, ya, xm, ym, depth + 1)
    segment(xm, ym, xb, yb, depth + 1)
  }

  let prevX = x0
  let prevY = evalAt(x0)
  push(prevX, prevY)
  for (let i = 1; i <= BASE_SAMPLES; i += 1) {
    const x = x0 + ((x1 - x0) * i) / BASE_SAMPLES
    const y = evalAt(x)
    segment(prevX, prevY, x, y, 0)
    prevX = x
    prevY = y
  }
  return points
}

interface IntegralData {
  lo: number
  hi: number
  value: number
  areaPath: string
}

/** 합성 심프슨 공식 — 구간 내 비유한값이 있으면 NaN으로 흘러나온다 */
function integrate(evalAt: (x: number) => number, lo: number, hi: number): number {
  if (lo === hi) return 0
  const a = Math.min(lo, hi)
  const b = Math.max(lo, hi)
  const h = (b - a) / SIMPSON_STEPS
  let sum = evalAt(a) + evalAt(b)
  for (let i = 1; i < SIMPSON_STEPS; i += 1) {
    sum += evalAt(a + h * i) * (i % 2 === 1 ? 4 : 2)
  }
  const value = (sum * h) / 3
  return lo <= hi ? value : -value
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

  // 적분 구간 음영 + 수치 적분값
  let integral: IntegralData | null = null
  if (plot.integral) {
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
    allInvalid,
  }
}

interface ParamValueInputProps {
  param: GraphParam
  value: number
  onCommit: (v: number) => void
}

/**
 * 파라미터 값 직접 입력 박스 — Enter/blur로 확정.
 * draft가 null이면 비편집 상태로, 슬라이더로 바뀌는 외부 값을 그대로 표시한다.
 * 범위 밖·비숫자 입력은 입력 전 값으로 되돌리고 하단에 허용 범위 안내를 띄운다
 * (안내는 다시 타이핑하거나 유효한 값을 확정하면 사라진다).
 */
function ParamValueInput({ param, value, onCommit }: ParamValueInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    if (draft === null) return
    const n = Number(draft.trim())
    const ok =
      draft.trim() !== '' && Number.isFinite(n) && n >= param.min && n <= param.max
    if (ok) onCommit(n)
    setDraft(null) // 유효하면 확정값이, 아니면 입력 전 값이 표시된다
    setInvalid(!ok)
  }

  return (
    <span className="fngraph__param-value-box">
      <input
        type="text"
        inputMode="decimal"
        className="fngraph__param-value"
        aria-label={`${param.name} 값 직접 입력`}
        aria-invalid={invalid}
        value={draft ?? fmt(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value)
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(null)
            setInvalid(false)
          }
        }}
      />
      {invalid && (
        <span className="fngraph__param-error">
          {`${fmt(param.min)} ~ ${fmt(param.max)} 사이의 숫자를 입력하세요`}
        </span>
      )}
    </span>
  )
}

interface SubPlotProps {
  plot: PlotSpec
  values: Record<string, number>
  height: number
}

/** 구역의 실측 폭 — 배치는 CSS grid 전담, SVG는 실측 px로 그린다(rem 규칙 유지) */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
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

/** 서브플롯 종류 분기 — 훅 구성이 달라 컴포넌트를 나눈다 */
function SubPlot({ plot, values, height }: SubPlotProps) {
  return plot.kind === 'circle' ? (
    <CircleSubPlot plot={plot} values={values} height={height} />
  ) : (
    <FnSubPlot plot={plot} values={values} height={height} />
  )
}

/** 원 표시 범위 — 반지름 1의 단위원이 눈금과 함께 들어가는 세로 반폭 */
const CIRCLE_EXTENT = 1.25

/**
 * kind = "circle" 서브플롯 — 단위원 + param 각도를 따라 회전하는 반지름.
 * 가로/세로 px-per-unit을 동일하게 맞춰(가로 정의역을 종횡비로 보정) 원이
 * 타원으로 찌그러지지 않게 한다. 끝점의 축 사영(점선)이 sin·cos 값을 잇는다.
 */
function CircleSubPlot({
  plot,
  values,
  height,
}: {
  plot: CirclePlotSpec
  values: Record<string, number>
  height: number
}) {
  const [bodyRef, width] = useMeasuredWidth()

  const data = useMemo(() => {
    const innerW = width - MARGIN.left - MARGIN.right
    const innerH = height - MARGIN.top - MARGIN.bottom
    if (innerW < 40 || innerH < 40) return null
    const xHalf = CIRCLE_EXTENT * (innerW / innerH)
    const xScale = scaleLinear().domain([-xHalf, xHalf]).range([0, innerW])
    const yScale = scaleLinear().domain([-CIRCLE_EXTENT, CIRCLE_EXTENT]).range([innerH, 0])
    return {
      innerW,
      innerH,
      xScale,
      yScale,
      r: xScale(1) - xScale(0),
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
                <line
                  className="fngraph__cross"
                  x1={data.xScale(px)}
                  y1={data.yScale(py)}
                  x2={data.xScale(px)}
                  y2={data.yScale(0)}
                />
                <line
                  className="fngraph__cross"
                  x1={data.xScale(px)}
                  y1={data.yScale(py)}
                  x2={data.xScale(0)}
                  y2={data.yScale(py)}
                />
                <line
                  className="fngraph__radius"
                  x1={data.xScale(0)}
                  y1={data.yScale(0)}
                  x2={data.xScale(px)}
                  y2={data.yScale(py)}
                />
                <circle className="fngraph__dot" cx={data.xScale(px)} cy={data.yScale(py)} r={4} />
              </>
            )}
          </g>
        </svg>
      )}
      <div className="fngraph__readout">
        {ok
          ? `θ = ${fmt(deg)}°    cos θ = ${fmt(px)}    sin θ = ${fmt(py)}`
          : 'θ = —  (angle 식이 유한한 값이 아닙니다)'}
      </div>
    </div>
  )
}

/**
 * kind = "fn" 서브플롯 — 자기 폭을 ResizeObserver로 실측하고(배치는 CSS grid 전담),
 * 호버 크로스헤어·함숫값 readout·적분 readout을 구역 단위로 갖는다.
 */
function FnSubPlot({
  plot,
  values,
  height,
}: {
  plot: FnPlotSpec
  values: Record<string, number>
  height: number
}) {
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
                {data.integral && data.integral.areaPath && (
                  <path className="fngraph__area" d={data.integral.areaPath} />
                )}
                {data.integral &&
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
                {hoverX !== null && (
                  <line
                    className="fngraph__cross"
                    x1={data.xScale(hoverX)}
                    x2={data.xScale(hoverX)}
                    y1={0}
                    y2={data.innerH}
                  />
                )}
                {hoverX !== null && hoverY !== null && Number.isFinite(hoverY) && (
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
      <div className="fngraph__readout">
        {hoverX !== null
          ? `x = ${fmt(hoverX)}    f(x) = ${fmt(hoverY ?? NaN)}`
          : 'x = —    f(x) = —  (그래프 위로 포인터를 올려 확인)'}
      </div>
      {data?.integral && (
        <div className="fngraph__readout fngraph__readout--integral">
          {`∫ f dx  [${fmt(data.integral.lo)} → ${fmt(data.integral.hi)}]  =  ${fmt(data.integral.value)}`}
        </div>
      )}
    </div>
  )
}

interface FunctionGraphProps {
  /** 코드 펜스 본문(스펙 텍스트) */
  spec: string
}

function FunctionGraph({ spec: specText }: FunctionGraphProps) {
  // 스펙(param 정의)이 바뀌면 저장된 슬라이더 값을 무시하도록 키를 함께 저장
  // (CLAUDE.md의 stale 상태 필터링 패턴 — 에디터 프리뷰에서 스펙 수정 시 대응)
  const [paramState, setParamState] = useState<{
    key: string
    values: Record<string, number>
  }>({ key: '', values: {} })

  const parsed = useMemo(() => {
    try {
      return { spec: parseGraphSpec(specText), error: '' }
    } catch (e) {
      return { spec: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [specText])
  const spec = parsed.spec

  const paramKey = useMemo(
    () => (spec ? JSON.stringify(spec.params) : ''),
    [spec],
  )
  const values = useMemo(() => {
    const overrides = paramState.key === paramKey ? paramState.values : {}
    const v: Record<string, number> = {}
    spec?.params.forEach((p) => {
      v[p.name] = overrides[p.name] ?? p.def
    })
    return v
  }, [spec, paramKey, paramState])

  if (!spec) {
    return (
      <div className="fngraph fngraph--error">
        <div className="fngraph__title">GRAPH — 스펙 오류</div>
        <div className="fngraph__error-msg">{parsed.error}</div>
      </div>
    )
  }

  const setValue = (name: string, v: number) =>
    setParamState((prev) => ({
      key: paramKey,
      values: { ...(prev.key === paramKey ? prev.values : {}), [name]: v },
    }))

  const titleOf = (p: PlotSpec) =>
    p.title ?? (p.kind === 'circle' ? '단위원' : `f(x) = ${p.fnSource}`)
  const multi = spec.plots.length > 1

  return (
    <div className="fngraph">
      {!multi && <div className="fngraph__title">{titleOf(spec.plots[0])}</div>}
      <div
        className={
          multi ? 'fngraph__plot-wrap fngraph__plot-wrap--grid' : 'fngraph__plot-wrap'
        }
      >
        {multi ? (
          // 작성 순서 배치: 2개 → 2×1, 3~4개 → 2×2 (3개면 넷째 칸은 grid가 빈 칸으로 남긴다)
          spec.plots.map((p, i) => (
            <div className="fngraph__cell" key={i}>
              <div className="fngraph__title fngraph__title--sub">{titleOf(p)}</div>
              <SubPlot plot={p} values={values} height={SUB_PLOT_HEIGHT} />
            </div>
          ))
        ) : (
          <SubPlot plot={spec.plots[0]} values={values} height={PLOT_HEIGHT} />
        )}
      </div>
      {spec.params.length > 0 && (
        <div className="fngraph__params">
          {spec.params.map((p) => (
            <div className="fngraph__param" key={p.name}>
              <span className="fngraph__param-name">{p.name}</span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={values[p.name]}
                onChange={(e) => setValue(p.name, Number(e.target.value))}
              />
              <ParamValueInput
                param={p}
                value={values[p.name]}
                onCommit={(v) => setValue(p.name, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FunctionGraph
