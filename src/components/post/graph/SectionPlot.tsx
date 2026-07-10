import { useId, useMemo, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area as makeArea, line as makeLine } from 'd3-shape'
import { marchingSquares } from '../../../lib/plot/marching'
import { findRoots, integrate } from '../../../lib/plot/numeric'
import { BASE_SAMPLES, sampleCurve, sampleParametric } from '../../../lib/plot/sample'
import { isShown, type SceneSection } from '../../../lib/scene'
import { MARGIN } from './constants'
import { fmt } from './fmt'
import { useMeasuredWidth } from './useMeasuredWidth'

/**
 * 구역(section) 하나의 좌표계 — Scene IR 아이템들을 레이어 순서(채움 → 막대·방향장
 * → 곡선 → 보조선 → 점·텍스트 → 호버)로 그린다. 자기 폭은 ResizeObserver 실측
 * (배치는 CSS grid 전담), 계산은 전부 useMemo 안 — 호버 상태 변화로 재실행되지
 * 않도록 deps는 [section, values, width, height]를 유지한다.
 */

const AREA_SAMPLES = 400
const IMPLICIT_NX = 96
const FIELD_COLS = 14
const MAX_RIEMANN = 400

type Scale = ReturnType<typeof scaleLinear<number, number>>

interface Prep {
  innerW: number
  innerH: number
  xScale: Scale
  yScale: Scale
  xTicks: number[]
  yTicks: number[]
  xFormat: (n: number) => string
  yFormat: (n: number) => string
  fills: Array<{ key: string; d: string; cls: string }>
  bars: Array<{ key: string; d: string }>
  field: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>
  curves: Array<{ key: string; d: string; color: number }>
  auxLines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; cls: string }>
  heads: Array<{ key: string; points: string }>
  marks: Array<{ key: string; cx: number; cy: number; ring: boolean }>
  texts: Array<{ key: string; x: number; y: number; text: string }>
  readouts: Array<{ key: string; text: string }>
  hoverCurves: Array<{ id: string; label: string; evalX: (x: number) => number; color: number }>
  hoverEnabled: boolean
}

function build(
  section: SceneSection,
  values: Record<string, number>,
  width: number,
  height: number,
): Prep | null {
  const innerW = width - MARGIN.left - MARGIN.right
  const innerH = height - MARGIN.top - MARGIN.bottom
  if (innerW < 40 || innerH < 40) return null

  const view = section.view
  const [x0, x1] = view.x ?? [-10, 10]

  /** 아이템별 x-평가 클로저 (env 재사용 — 클로저마다 자기 env를 가진다) */
  const xClosure = (evalAt: (env: Record<string, number>) => number) => {
    const env: Record<string, number> = { ...values, x: 0 }
    return (x: number) => {
      env.x = x
      return evalAt(env)
    }
  }
  const xyClosure = (F: (env: Record<string, number>) => number) => {
    const env: Record<string, number> = { ...values, x: 0, y: 0 }
    return (x: number, y: number) => {
      env.x = x
      env.y = y
      return F(env)
    }
  }

  // ── y 표시 범위: view.y 지정 시 그대로, 아니면 유한 샘플 기반 자동 + nice ──
  let yMin = Infinity
  let yMax = -Infinity
  const feed = (y: number) => {
    if (Number.isFinite(y)) {
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
  }
  let needsPlane = false // 음함수·영역·방향장 — y 범위를 스스로 정하지 못한다
  for (const item of section.items) {
    switch (item.t) {
      case 'curve': {
        const evalX = xClosure(item.evalAt)
        for (let i = 0; i <= BASE_SAMPLES; i += 1)
          feed(evalX(x0 + ((x1 - x0) * i) / BASE_SAMPLES))
        break
      }
      case 'parametric': {
        const env: Record<string, number> = { ...values, s: 0 }
        for (let i = 0; i <= 200; i += 1) {
          env.s = item.range[0] + ((item.range[1] - item.range[0]) * i) / 200
          feed(item.fy(env))
        }
        break
      }
      case 'polar': {
        const env: Record<string, number> = { ...values, theta: 0 }
        for (let i = 0; i <= 200; i += 1) {
          const th = item.range[0] + ((item.range[1] - item.range[0]) * i) / 200
          env.theta = th
          feed(item.r(env) * Math.sin(th))
        }
        break
      }
      case 'seq': {
        const env: Record<string, number> = { ...values, n: 0 }
        for (let n = Math.ceil(item.range[0]); n <= item.range[1]; n += 1) {
          env.n = n
          feed(item.term(env))
        }
        break
      }
      case 'point':
        if (item.py) feed(item.py(values))
        break
      case 'implicit':
      case 'region':
      case 'field':
        needsPlane = true
        break
      default:
        break
    }
  }

  let yDomain: [number, number]
  if (view.y) yDomain = view.y
  else if (yMin > yMax) yDomain = needsPlane ? [-10, 10] : [-1, 1]
  else if (yMin === yMax) yDomain = [yMin - 1, yMax + 1]
  else {
    const pad = (yMax - yMin) * 0.08
    yDomain = [yMin - pad, yMax + pad]
  }

  const xScale = scaleLinear().domain([x0, x1]).range([0, innerW])
  const yScale = scaleLinear().domain(yDomain).range([innerH, 0])
  if (!view.y) yScale.nice()

  // ── equal: px-per-unit 등화 — 짧은 쪽 ppu에 맞춰 다른 축 범위를 넓힌다 ──
  if (view.equal) {
    const [xa, xb] = xScale.domain() as [number, number]
    const [ya, yb] = yScale.domain() as [number, number]
    const ppuX = innerW / (xb - xa)
    const ppuY = innerH / (yb - ya)
    if (ppuX > ppuY) {
      const half = innerW / ppuY / 2
      const cx = (xa + xb) / 2
      xScale.domain([cx - half, cx + half])
    } else if (ppuY > ppuX) {
      const half = innerH / ppuX / 2
      const cy = (ya + yb) / 2
      yScale.domain([cy - half, cy + half])
    }
  }

  const [xLo, xHi] = xScale.domain() as [number, number]
  const [yLo, yHi] = yScale.domain() as [number, number]
  const sx = (x: number) => xScale(x)
  const sy = (y: number) => yScale(y)
  const clampY = (y: number) =>
    Math.min(yHi + 2 * (yHi - yLo), Math.max(yLo - 2 * (yHi - yLo), y))

  const lineGen = makeLine<[number, number]>()
    .x((d) => sx(d[0]))
    .y((d) => sy(d[1]))
    .defined((d) => Number.isFinite(d[1]) && Number.isFinite(d[0]))

  const prep: Prep = {
    innerW,
    innerH,
    xScale,
    yScale,
    xTicks: xScale.ticks(Math.max(3, Math.min(10, Math.floor(innerW / 70)))),
    yTicks: yScale.ticks(6),
    xFormat: xScale.tickFormat(Math.max(3, Math.min(10, Math.floor(innerW / 70)))),
    yFormat: yScale.tickFormat(6),
    fills: [],
    bars: [],
    field: [],
    curves: [],
    auxLines: [],
    heads: [],
    marks: [],
    texts: [],
    readouts: [],
    hoverCurves: [],
    hoverEnabled: false,
  }

  /**
   * (xAt, yAt)를 지나는 기울기 slope의 직선을 표시 영역까지 연장한 보조선.
   * 끝점 y를 클램프하면 직선이 회전해 접점을 벗어나므로(가파른 접선에서 실측된
   * 버그), y 클램프 범위와의 교차점으로 x 구간을 줄여 기하를 보존한다.
   */
  const fullLine = (key: string, xAt: number, yAt: number, slope: number, cls: string) => {
    if (!Number.isFinite(xAt) || !Number.isFinite(yAt) || !Number.isFinite(slope)) return
    const lo = yLo - 2 * (yHi - yLo)
    const hi = yHi + 2 * (yHi - yLo)
    let xa = xLo
    let xb = xHi
    if (slope !== 0) {
      const cross1 = xAt + (lo - yAt) / slope
      const cross2 = xAt + (hi - yAt) / slope
      xa = Math.max(xa, Math.min(cross1, cross2))
      xb = Math.min(xb, Math.max(cross1, cross2))
      if (xa >= xb) return // 직선이 표시 영역을 지나지 않는다
    } else if (yAt < lo || yAt > hi) return
    prep.auxLines.push({
      key,
      x1: sx(xa),
      y1: sy(yAt + slope * (xa - xAt)),
      x2: sx(xb),
      y2: sy(yAt + slope * (xb - xAt)),
      cls,
    })
  }

  const ny = Math.max(24, Math.min(96, Math.round((IMPLICIT_NX * innerH) / innerW)))

  for (const item of section.items) {
    switch (item.t) {
      case 'curve': {
        const evalX = xClosure(item.evalAt)
        if (isShown(item, 'curve')) {
          const pts = sampleCurve(evalX, xLo, xHi, yLo, yHi)
          prep.curves.push({ key: item.id, d: lineGen(pts) ?? '', color: item.colorIndex })
        }
        if (isShown(item, 'hover'))
          prep.hoverCurves.push({
            id: item.id,
            label: item.label,
            evalX,
            color: item.colorIndex,
          })
        break
      }
      case 'implicit': {
        if (!isShown(item, 'curve')) break
        const F = xyClosure(item.F)
        const { segments } = marchingSquares(F, xLo, xHi, yLo, yHi, IMPLICIT_NX, ny, false)
        let d = ''
        for (const [ax, ay, bx, by] of segments)
          d += `M${sx(ax).toFixed(2)},${sy(ay).toFixed(2)}L${sx(bx).toFixed(2)},${sy(by).toFixed(2)}`
        prep.curves.push({ key: item.id, d, color: item.colorIndex })
        break
      }
      case 'region': {
        if (!isShown(item, 'area')) break
        const F = xyClosure(item.F)
        const { polygons } = marchingSquares(F, xLo, xHi, yLo, yHi, IMPLICIT_NX, ny, true)
        let d = ''
        for (const poly of polygons) {
          d += poly
            .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${sx(px).toFixed(2)},${sy(py).toFixed(2)}`)
            .join('')
          d += 'Z'
        }
        prep.fills.push({ key: item.id, d, cls: 'fngraph__area' })
        break
      }
      case 'polar': {
        if (!isShown(item, 'curve')) break
        const env: Record<string, number> = { ...values, theta: 0 }
        const pts = sampleParametric(
          (th) => {
            env.theta = th
            return item.r(env) * Math.cos(th)
          },
          (th) => {
            env.theta = th
            return item.r(env) * Math.sin(th)
          },
          item.range[0],
          item.range[1],
        )
        prep.curves.push({ key: item.id, d: lineGen(pts) ?? '', color: item.colorIndex })
        break
      }
      case 'parametric': {
        if (!isShown(item, 'curve')) break
        const env: Record<string, number> = { ...values, s: 0 }
        const pts = sampleParametric(
          (s) => {
            env.s = s
            return item.fx(env)
          },
          (s) => {
            env.s = s
            return item.fy(env)
          },
          item.range[0],
          item.range[1],
        )
        prep.curves.push({ key: item.id, d: lineGen(pts) ?? '', color: item.colorIndex })
        break
      }
      case 'seq': {
        if (!isShown(item, 'points')) break
        const env: Record<string, number> = { ...values, n: 0 }
        for (let n = Math.ceil(item.range[0]); n <= item.range[1]; n += 1) {
          env.n = n
          const v = item.term(env)
          if (Number.isFinite(v))
            prep.marks.push({ key: `${item.id}:${n}`, cx: sx(n), cy: sy(v), ring: false })
        }
        break
      }
      case 'field': {
        if (!isShown(item, 'field')) break
        const slope = xyClosure(item.slope)
        const rows = Math.max(4, Math.round((FIELD_COLS * innerH) / innerW))
        const len = Math.min(innerW / FIELD_COLS, innerH / rows) * 0.35
        for (let j = 0; j < rows; j += 1) {
          for (let i = 0; i < FIELD_COLS; i += 1) {
            const dx = xLo + ((xHi - xLo) * (i + 0.5)) / FIELD_COLS
            const dy = yLo + ((yHi - yLo) * (j + 0.5)) / rows
            const m = slope(dx, dy)
            if (!Number.isFinite(m)) continue
            // 데이터 기울기 → px 방향 (y축 px는 아래로 증가하므로 부호 반전)
            const px = (xHi - xLo) / innerW
            const py = (yHi - yLo) / innerH
            const vx = 1 / px
            const vy = -m / py
            const norm = Math.hypot(vx, vy) || 1
            const ux = (vx / norm) * len
            const uy = (vy / norm) * len
            prep.field.push({
              key: `${item.id}:${i}:${j}`,
              x1: sx(dx) - ux,
              y1: sy(dy) - uy,
              x2: sx(dx) + ux,
              y2: sy(dy) + uy,
            })
          }
        }
        break
      }
      case 'tangent': {
        const xAt = item.at(values)
        const env: Record<string, number> = { ...values, x: xAt }
        const yAt = item.of.evalAt(env)
        const m = item.deriv(env)
        if (isShown(item, 'line')) fullLine(item.id, xAt, yAt, m, 'fngraph__aux')
        if (Number.isFinite(yAt))
          prep.marks.push({ key: `${item.id}:pt`, cx: sx(xAt), cy: sy(yAt), ring: true })
        if (isShown(item, 'value'))
          prep.readouts.push({
            key: item.id,
            text: `${item.of.name}'(${fmt(xAt)}) = ${fmt(m)}`,
          })
        break
      }
      case 'secant': {
        const a = item.a(values)
        const b = item.b(values)
        const evalX = xClosure(item.of.evalAt)
        const fa = evalX(a)
        const fb = evalX(b)
        const m = (fb - fa) / (b - a)
        if (isShown(item, 'line')) fullLine(item.id, a, fa, m, 'fngraph__aux')
        for (const [k, px2, py2] of [
          ['a', a, fa],
          ['b', b, fb],
        ] as const) {
          if (Number.isFinite(py2))
            prep.marks.push({ key: `${item.id}:${k}`, cx: sx(px2), cy: sy(py2), ring: true })
        }
        if (isShown(item, 'value'))
          prep.readouts.push({
            key: item.id,
            text: `기울기 [${fmt(a)} → ${fmt(b)}] = ${fmt(m)}`,
          })
        break
      }
      case 'integral': {
        const lo = item.a(values)
        const hi = item.b(values)
        const evalX = xClosure(item.of.evalAt)
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
          if (isShown(item, 'value'))
            prep.readouts.push({ key: item.id, text: `∫ ${item.of.name} = —` })
          break
        }
        if (isShown(item, 'area') && lo !== hi) {
          const a = Math.min(lo, hi)
          const b = Math.max(lo, hi)
          const pts: Array<[number, number]> = []
          for (let i = 0; i <= AREA_SAMPLES; i += 1) {
            const x = a + ((b - a) * i) / AREA_SAMPLES
            pts.push([x, evalX(x)])
          }
          const baseline = sy(Math.min(yHi, Math.max(yLo, 0)))
          const gen = makeArea<[number, number]>()
            .x((d) => sx(d[0]))
            .y0(baseline)
            .y1((d) => sy(clampY(d[1])))
            .defined((d) => Number.isFinite(d[1]))
          prep.fills.push({ key: item.id, d: gen(pts) ?? '', cls: 'fngraph__area' })
          for (const [k, bx] of [
            ['lo', lo],
            ['hi', hi],
          ] as const)
            prep.auxLines.push({
              key: `${item.id}:${k}`,
              x1: sx(bx),
              y1: 0,
              x2: sx(bx),
              y2: innerH,
              cls: 'fngraph__bound',
            })
        }
        if (isShown(item, 'value'))
          prep.readouts.push({
            key: item.id,
            text: `∫ ${item.of.name} [${fmt(lo)} → ${fmt(hi)}] = ${fmt(integrate(evalX, lo, hi))}`,
          })
        break
      }
      case 'riemann': {
        const lo = item.a(values)
        const hi = item.b(values)
        const nRaw = item.n(values)
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(nRaw) || lo === hi)
          break
        const n = Math.max(1, Math.min(MAX_RIEMANN, Math.round(nRaw)))
        const a = Math.min(lo, hi)
        const b = Math.max(lo, hi)
        const w = (b - a) / n
        const evalX = xClosure(item.of.evalAt)
        const base = sy(Math.min(yHi, Math.max(yLo, 0)))
        let d = ''
        let sum = 0
        for (let i = 0; i < n; i += 1) {
          const xi =
            item.method === 'left' ? a + i * w
            : item.method === 'right' ? a + (i + 1) * w
            : a + (i + 0.5) * w
          const v = evalX(xi)
          if (!Number.isFinite(v)) continue
          sum += v * w
          d += `M${sx(a + i * w).toFixed(2)},${base.toFixed(2)}L${sx(a + i * w).toFixed(2)},${sy(clampY(v)).toFixed(2)}L${sx(a + (i + 1) * w).toFixed(2)},${sy(clampY(v)).toFixed(2)}L${sx(a + (i + 1) * w).toFixed(2)},${base.toFixed(2)}Z`
        }
        if (isShown(item, 'bars')) prep.bars.push({ key: item.id, d })
        if (isShown(item, 'value'))
          prep.readouts.push({
            key: item.id,
            text: `Σ ${item.of.name}·Δx (n = ${n}, ${item.method}) = ${fmt(lo <= hi ? sum : -sum)}`,
          })
        break
      }
      case 'area': {
        const lo = item.a(values)
        const hi = item.b(values)
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) break
        const a = Math.min(lo, hi)
        const b = Math.max(lo, hi)
        const evalF = xClosure(item.of.evalAt)
        const evalG = xClosure(item.g.evalAt)
        if (isShown(item, 'area')) {
          const pts: Array<[number, number]> = []
          for (let i = 0; i <= AREA_SAMPLES; i += 1)
            pts.push([a + ((b - a) * i) / AREA_SAMPLES, 0])
          const gen = makeArea<[number, number]>()
            .x((d) => sx(d[0]))
            .y0((d) => sy(clampY(evalG(d[0]))))
            .y1((d) => sy(clampY(evalF(d[0]))))
            .defined((d) => Number.isFinite(evalF(d[0])) && Number.isFinite(evalG(d[0])))
          prep.fills.push({ key: item.id, d: gen(pts) ?? '', cls: 'fngraph__area' })
        }
        if (isShown(item, 'value'))
          prep.readouts.push({
            key: item.id,
            text: `∫|${item.of.name} − ${item.g.name}| [${fmt(a)} → ${fmt(b)}] = ${fmt(
              integrate((x) => Math.abs(evalF(x) - evalG(x)), a, b),
            )}`,
          })
        break
      }
      case 'intersect': {
        const evalF = xClosure(item.f.evalAt)
        let h: (x: number) => number
        if (item.kind === 'ff' && item.g) {
          const evalG = xClosure(item.g.evalAt)
          h = (x) => evalF(x) - evalG(x)
        } else if (item.F) {
          const F = xyClosure(item.F)
          h = (x) => F(x, evalF(x))
        } else break
        const roots = findRoots(h, xLo, xHi)
        if (isShown(item, 'marks')) {
          for (const rx of roots) {
            const ry = evalF(rx)
            if (Number.isFinite(ry))
              prep.marks.push({ key: `${item.id}:${fmt(rx)}`, cx: sx(rx), cy: sy(ry), ring: false })
          }
        }
        if (isShown(item, 'value')) {
          const shown = roots.slice(0, 4).map((rx) => `(${fmt(rx)}, ${fmt(evalF(rx))})`)
          prep.readouts.push({
            key: item.id,
            text: `${item.aName} ∩ ${item.bName}: ${
              roots.length === 0 ? '없음' : shown.join(' ') + (roots.length > 4 ? ' …' : '')
            }`,
          })
        }
        break
      }
      case 'point': {
        let px: number
        let py: number
        if (item.of && item.at) {
          px = item.at(values)
          py = xClosure(item.of.evalAt)(px)
        } else if (item.px && item.py) {
          px = item.px(values)
          py = item.py(values)
        } else break
        if (isShown(item, 'mark') && Number.isFinite(px) && Number.isFinite(py))
          prep.marks.push({ key: item.id, cx: sx(px), cy: sy(py), ring: true })
        if (isShown(item, 'value'))
          prep.readouts.push({ key: item.id, text: `${item.label} = (${fmt(px)}, ${fmt(py)})` })
        break
      }
      case 'vector':
      case 'segment': {
        if (!isShown(item, 'line')) break
        const ax = item.x1(values)
        const ay = item.y1(values)
        const bx = item.x2(values)
        const by = item.y2(values)
        if (![ax, ay, bx, by].every(Number.isFinite)) break
        const cls = item.t === 'vector' ? 'fngraph__vector' : 'fngraph__seg'
        prep.auxLines.push({ key: item.id, x1: sx(ax), y1: sy(ay), x2: sx(bx), y2: sy(by), cls })
        if (item.t === 'vector') {
          // 화살촉 — px 좌표계에서 종점 방향 삼각형
          const hx = sx(bx) - sx(ax)
          const hy = sy(by) - sy(ay)
          const norm = Math.hypot(hx, hy) || 1
          const ux = (hx / norm) * 8
          const uy = (hy / norm) * 8
          const wx = -uy * 0.45
          const wy = ux * 0.45
          prep.heads.push({
            key: item.id,
            points: `${sx(bx)},${sy(by)} ${sx(bx) - ux + wx},${sy(by) - uy + wy} ${sx(bx) - ux - wx},${sy(by) - uy - wy}`,
          })
        }
        break
      }
      case 'line': {
        if (!isShown(item, 'line')) break
        fullLine(item.id, item.px(values), item.py(values), item.slope(values), 'fngraph__seg')
        break
      }
      case 'label': {
        if (!isShown(item, 'text')) break
        const lx = item.px(values)
        const ly = item.py(values)
        if (Number.isFinite(lx) && Number.isFinite(ly))
          prep.texts.push({ key: item.id, x: sx(lx), y: sy(ly), text: item.text })
        break
      }
      default:
        break
    }
  }

  prep.hoverEnabled = !section.hoverHidden && prep.hoverCurves.length > 0
  return prep
}

interface SectionPlotProps {
  section: SceneSection
  /** 상수 + param 현재값 병합 env */
  values: Record<string, number>
  height: number
}

function SectionPlot({ section, values, height }: SectionPlotProps) {
  const clipId = useId()
  const [bodyRef, width] = useMeasuredWidth()
  const [hoverX, setHoverX] = useState<number | null>(null)

  const data = useMemo(
    () => build(section, values, width, height),
    [section, values, width, height],
  )

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!data || !data.hoverEnabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left - MARGIN.left
    setHoverX(px >= 0 && px <= data.innerW ? data.xScale.invert(px) : null)
  }

  // 타입 내로잉용 — 호버 비활성 구역이면 항상 null
  const hx: number | null = data?.hoverEnabled && hoverX !== null ? hoverX : null

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
            <g clipPath={`url(#${clipId})`}>
              {data.fills.map((f) => f.d && <path key={f.key} className={f.cls} d={f.d} />)}
              {data.bars.map((b) => b.d && (
                <path key={b.key} className="fngraph__bars" d={b.d} />
              ))}
              {data.field.map((f) => (
                <line key={f.key} className="fngraph__field" x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
              ))}
              {data.curves.map((c) => c.d && (
                <path
                  key={c.key}
                  className={`fngraph__curve fngraph__curve--c${c.color}`}
                  d={c.d}
                />
              ))}
              {data.auxLines.map((l) => (
                <line key={l.key} className={l.cls} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
              ))}
              {data.heads.map((h) => (
                <polygon key={h.key} className="fngraph__vhead" points={h.points} />
              ))}
              {data.marks.map((m) => (
                <circle
                  key={m.key}
                  className={m.ring ? 'fngraph__point' : 'fngraph__dot'}
                  cx={m.cx}
                  cy={m.cy}
                  r={m.ring ? 4.5 : 3.5}
                />
              ))}
              {data.texts.map((t) => (
                <text key={t.key} className="fngraph__label" x={t.x} y={t.y}>
                  {t.text}
                </text>
              ))}
              {hx !== null && (
                <line
                  className="fngraph__cross"
                  x1={data.xScale(hx)}
                  x2={data.xScale(hx)}
                  y1={0}
                  y2={data.innerH}
                />
              )}
              {hx !== null &&
                data.hoverCurves.map((c) => {
                  const y = c.evalX(hx)
                  return Number.isFinite(y) ? (
                    <circle
                      key={c.id}
                      className="fngraph__dot"
                      cx={data.xScale(hx)}
                      cy={data.yScale(y)}
                      r={3.5}
                    />
                  ) : null
                })}
            </g>
          </g>
        </svg>
      )}
      {data && (data.hoverEnabled || data.readouts.length > 0) && (
        <div className="fngraph__readouts">
          {data.hoverEnabled && (
            <div className="fngraph__readout">{`x = ${hx !== null ? fmt(hx) : '—'}`}</div>
          )}
          {data.hoverEnabled &&
            data.hoverCurves.map((c) => (
              <div className="fngraph__readout" key={c.id}>
                {`${c.label} = ${hx !== null ? fmt(c.evalX(hx)) : '—'}`}
              </div>
            ))}
          {data.readouts.map((row) => (
            <div className="fngraph__readout fngraph__readout--integral" key={row.key}>
              {row.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SectionPlot
