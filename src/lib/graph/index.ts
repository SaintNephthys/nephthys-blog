/**
 * ```graph 코드 펜스의 스펙 파서 — TOML (구 줄 단위 문법은 2026-07-09 폐기).
 * 저자용 문법 문서는 devnotes §2, 영구 불변식은 §2.5 문법 계약 참조.
 *
 * 구조: kind 모듈(kinds/*)이 plot 하나의 스키마·파싱을 소유하고, 이 파일은
 * 최상위 오케스트레이션(TOML 파싱·params·[[plot]] 배열·kind 디스패치)만 한다.
 * 새 kind 추가 절차: kinds/<이름>.ts 작성 → 아래 KINDS와 PlotSpec 유니언에 등록
 * → 렌더 컴포넌트를 SubPlot 디스패처에 등록(무거우면 React.lazy)
 * → 에디터 GraphComposer.tsx 카탈로그에 KindDef 등록(타입 강제 없음 — 잊기 쉬움).
 * 새 plot 키·display 항목도 GraphComposer 카탈로그에 PropDef로 반영할 것.
 *
 * 구 문법(`fn: …`)은 TOML 구문 오류로 시끄럽게 거부된다 — 조용한 오해석 없음.
 * 게시물 md에 영속되는 스키마이므로 확장은 항상 하위 호환으로만 한다.
 */

import { parse as parseToml } from 'smol-toml'
import { circleKind, type CirclePlotSpec } from './kinds/circle'
import type { ParseContext } from './kinds/contract'
import { fnKind, type FnPlotSpec } from './kinds/fn'
import { parseParam, type GraphParam } from './params'
import { asInterval, isRecord } from './primitives'

export type { GraphIntegral } from './features/integral'
export type { CircleDisplay, CirclePlotSpec } from './kinds/circle'
export type { FnDisplay, FnPlotSpec } from './kinds/fn'
export type { GraphParam } from './params'

/** kind 레지스트리 — 리터럴 객체 + 판별 유니언 병존(소진성 검사 보존) */
const KINDS = { fn: fnKind, circle: circleKind } as const

export type PlotSpec = FnPlotSpec | CirclePlotSpec

export interface GraphSpec {
  plots: PlotSpec[]
  params: GraphParam[]
}

const MAX_PLOTS = 4
/**
 * 최상위 키는 여기서 **동결**(문법 계약 §2.5) — fn 단일 모드 설탕 + params + plot.
 * 새 kind는 설정을 전부 [[plot]] 안에 둔다.
 */
const TOP_KEYS = new Set([
  'fn',
  'domain',
  'range',
  'integral',
  'point',
  'params',
  'plot',
  'display',
])
const ALL_PLOT_KEYS = new Set<string>(
  Object.values(KINDS).flatMap((k) => [...k.plotKeys]),
)

function parsePlot(
  v: unknown,
  label: string,
  paramNames: string[],
  defaults: ParseContext['defaults'],
): PlotSpec {
  if (!isRecord(v)) throw new Error(`${label}은(는) 테이블이어야 합니다`)
  for (const key of Object.keys(v)) {
    if (!ALL_PLOT_KEYS.has(key))
      throw new Error(
        `${label}의 알 수 없는 키: '${key}' (${[...ALL_PLOT_KEYS].join('·')}만 지원)`,
      )
  }
  const kind = 'kind' in v ? v.kind : 'fn'
  if (typeof kind !== 'string' || !(kind in KINDS))
    throw new Error(
      `${label}의 kind는 ${Object.keys(KINDS)
        .map((k) => `"${k}"`)
        .join(' 또는 ')}이어야 합니다`,
    )
  return KINDS[kind as keyof typeof KINDS].parse(v, { paramNames, defaults, label })
}

export function parseGraphSpec(text: string): GraphSpec {
  let data: unknown
  try {
    data = parseToml(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`TOML 구문 오류 — ${msg}`, { cause: e })
  }
  if (!isRecord(data)) throw new Error('스펙이 TOML 테이블이 아닙니다')

  for (const key of Object.keys(data)) {
    if (!TOP_KEYS.has(key))
      throw new Error(`알 수 없는 키: '${key}' (fn·domain·range·integral·params·plot만 지원)`)
  }

  const params: GraphParam[] = []
  if ('params' in data) {
    if (!isRecord(data.params))
      throw new Error('params는 테이블이어야 합니다 ([params] 섹션)')
    // 선언 순서 = 슬라이더 표시 순서 (params.ts 헤더 주석 참조)
    for (const [name, v] of Object.entries(data.params)) params.push(parseParam(name, v))
  }
  const paramNames = params.map((p) => p.name)

  const defaults: ParseContext['defaults'] = {
    domain: 'domain' in data ? asInterval(data.domain, 'domain') : undefined,
    range: 'range' in data ? asInterval(data.range, 'range') : undefined,
  }

  let plots: PlotSpec[]
  if ('plot' in data) {
    if ('fn' in data)
      throw new Error(`최상위 fn과 [[plot]]은 함께 쓸 수 없습니다 — 각 plot 안에 fn을 지정`)
    if ('integral' in data)
      throw new Error(`[[plot]] 사용 시 integral은 각 plot 안에 지정합니다`)
    if ('display' in data)
      throw new Error(`[[plot]] 사용 시 display는 각 plot 안에 지정합니다`)
    if ('point' in data)
      throw new Error(`[[plot]] 사용 시 point는 각 plot 안에 지정합니다`)
    if (!Array.isArray(data.plot))
      throw new Error(`plot은 [[plot]] 테이블 배열이어야 합니다`)
    if (data.plot.length < 1 || data.plot.length > MAX_PLOTS)
      throw new Error(`[[plot]]은 1~${MAX_PLOTS}개만 지원합니다 (현재 ${data.plot.length}개)`)
    plots = data.plot.map((v, i) => parsePlot(v, `plot ${i + 1}`, paramNames, defaults))
  } else {
    if (!('fn' in data)) throw new Error(`'fn = "<식>"' 항목이 필요합니다`)
    // 단일 모드 설탕 — 최상위 fn 계열 키를 plots[0] (kind = "fn")으로 정규화
    const single: Record<string, unknown> = { fn: data.fn }
    if ('integral' in data) single.integral = data.integral
    if ('point' in data) single.point = data.point
    if ('display' in data) single.display = data.display
    plots = [parsePlot(single, 'fn', paramNames, defaults)]
  }

  return { plots, params }
}
