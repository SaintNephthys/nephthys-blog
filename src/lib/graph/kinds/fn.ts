/**
 * kind = "fn" (기본) — y = f(x) 함수 그래프.
 * 키: fn(필수)·domain·range·integral·point·display. domain/range는 최상위 기본값 상속.
 */

import { compileExpression, type EvalFn } from '../../mathExpr'
import { parseIntegral, type GraphIntegral } from '../features/integral'
import { parsePoint } from '../features/point'
import {
  asInterval,
  DEFAULT_DOMAIN,
  isRecord,
  parseFlags,
  parseTitle,
} from '../primitives'
import type { ParseContext, PlotKindModule } from './contract'

/**
 * 표시 항목 — **기본 전부 false**(명시한 것만 표시).
 * 최상위 항목(x·fx·integral)은 readout 줄, `graph.*`는 그래프 위 시각 요소.
 * 비호버 시 x·fx readout은 추적점(graph.point) 값을 표시한다(호버 우선).
 */
export interface FnDisplay {
  x: boolean
  fx: boolean
  integral: boolean
  graph: {
    integral: boolean
    point: boolean
  }
}

export interface FnPlotSpec {
  kind: 'fn'
  title?: string
  fnSource: string
  fn: EvalFn
  domain: [number, number]
  range?: [number, number]
  integral?: GraphIntegral
  /** 추적점의 x 위치 — param 식 (display.graph.point로 표시) */
  pointSource?: string
  point?: EvalFn
  display: FnDisplay
}

/** fn plot의 display — 최상위(readout)와 graph.*(시각 요소) 두 계층 */
function parseFnDisplay(v: unknown, label: string): FnDisplay {
  let graphPart: unknown
  let flatPart: unknown = v
  if (v !== undefined) {
    if (!isRecord(v))
      throw new Error(`${label}의 display는 'display.항목 = true/false' 형태여야 합니다`)
    const { graph, ...rest } = v
    graphPart = graph
    flatPart = rest
  }
  const flat = parseFlags(flatPart, label, ['x', 'fx', 'integral'])
  const graph = parseFlags(graphPart, label, ['integral', 'point'], 'display.graph')
  return {
    x: flat.x,
    fx: flat.fx,
    integral: flat.integral,
    graph: { integral: graph.integral, point: graph.point },
  }
}

export const fnKind: PlotKindModule<FnPlotSpec> = {
  kind: 'fn',
  plotKeys: ['kind', 'title', 'fn', 'domain', 'range', 'integral', 'point', 'display'],

  parse(v: Record<string, unknown>, ctx: ParseContext): FnPlotSpec {
    const { label, paramNames, defaults } = ctx
    if ('angle' in v)
      throw new Error(`${label}: 'angle'은 kind = "circle"에서만 지원합니다`)
    if (!('fn' in v)) throw new Error(`${label}에 'fn = "<식>"' 항목이 필요합니다`)
    if (typeof v.fn !== 'string' || !v.fn.trim())
      throw new Error(`${label}의 fn은 식을 담은 문자열이어야 합니다 (따옴표로 감쌀 것)`)

    const title = parseTitle(v, label)
    const fnSource = v.fn.trim()
    const fn = compileExpression(fnSource, ['x', ...paramNames])
    const domain =
      'domain' in v
        ? asInterval(v.domain, `${label} domain`)
        : (defaults.domain ?? DEFAULT_DOMAIN)
    const range = 'range' in v ? asInterval(v.range, `${label} range`) : defaults.range
    const integral = 'integral' in v ? parseIntegral(v.integral, paramNames) : undefined
    const tracked = 'point' in v ? parsePoint(v.point, label, paramNames) : undefined

    const display = parseFnDisplay(v.display, label)
    if (display.graph.point && !tracked)
      throw new Error(
        `${label}: display.graph.point에는 'point = "<param 식>"' 항목이 필요합니다`,
      )

    return {
      kind: 'fn',
      title,
      fnSource,
      fn,
      domain,
      range,
      integral,
      pointSource: tracked?.pointSource,
      point: tracked?.point,
      display,
    }
  },
}
