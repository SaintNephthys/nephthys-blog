/**
 * Scene IR — DSL 문장 파서(parse.ts)의 산출물이자 렌더러(components/post/graph)의
 * 입력. 문법과 렌더 사이의 방화벽: 표기 계층이 바뀌어도 이 IR 아래(수학 커널·렌더)는
 * 영향을 받지 않는다.
 *
 * 모든 EvalFn은 env(= 상수 + param 현재값 + 아이템별 문맥 변수 x·y·theta·s·n)를
 * 받아 숫자를 돌려주며 예외를 던지지 않는다(expr 계약).
 */

import type { EvalFn } from '../expr'

export interface ParamDef {
  name: string
  def: number
  min: number
  max: number
  step: number
}

export interface AnimateDef {
  name: string
  from: number
  to: number
  /** 재생 시간(초) */
  duration: number
  loop: boolean
}

export interface SectionView {
  x?: [number, number]
  y?: [number, number]
  /** 종횡비 등화 — px-per-unit을 축 간 동일하게 (원이 원으로 보이게) */
  equal: boolean
}

/** 아이템 공통 — id는 show/hide·readout 라벨·도구 참조의 대상 */
interface ItemBase {
  id: string
  /** hide 지시문으로 꺼진 슬롯 이름들 ('*' = 아이템 전체) */
  hidden: ReadonlySet<string>
  line: number
}

export interface CurveItem extends ItemBase {
  t: 'curve'
  /** readout 라벨 (예: "f(x)", "y", "f'(x)") */
  label: string
  /** 원본 식 텍스트 — 단일 그래프 타이틀 표시용 */
  source?: string
  /** env + x */
  evalAt: EvalFn
  colorIndex: number
}

export interface ImplicitItem extends ItemBase {
  t: 'implicit'
  /** 원본 방정식 텍스트 — 단일 그래프 타이틀 표시용 */
  source?: string
  /** env + x, y — F = 0 이 곡선 */
  F: EvalFn
  colorIndex: number
}

export interface RegionItem extends ItemBase {
  t: 'region'
  /** env + x, y — F > 0 영역을 채운다 */
  F: EvalFn
}

export interface PolarItem extends ItemBase {
  t: 'polar'
  /** env + theta */
  r: EvalFn
  range: [number, number]
  colorIndex: number
}

export interface ParametricItem extends ItemBase {
  t: 'parametric'
  /** env + s */
  fx: EvalFn
  fy: EvalFn
  range: [number, number]
  colorIndex: number
}

export interface SeqItem extends ItemBase {
  t: 'seq'
  label: string
  /** env + n */
  term: EvalFn
  range: [number, number]
}

export interface FieldItem extends ItemBase {
  t: 'field'
  /** env + x, y — 방향장의 기울기 */
  slope: EvalFn
}

/** x를 받는 호출 대상(정의된 함수)에 대한 참조 — 도구 문장이 사용 */
export interface FnRef {
  name: string
  /** env + x */
  evalAt: EvalFn
}

export interface TangentItem extends ItemBase {
  t: 'tangent'
  of: FnRef
  /** env + x — 도함수 */
  deriv: EvalFn
  /** env — 접점 x 위치 */
  at: EvalFn
}

export interface SecantItem extends ItemBase {
  t: 'secant'
  of: FnRef
  a: EvalFn
  b: EvalFn
}

export interface IntegralItem extends ItemBase {
  t: 'integral'
  of: FnRef
  a: EvalFn
  b: EvalFn
}

export interface RiemannItem extends ItemBase {
  t: 'riemann'
  of: FnRef
  a: EvalFn
  b: EvalFn
  n: EvalFn
  method: 'left' | 'right' | 'mid'
}

export interface AreaItem extends ItemBase {
  t: 'area'
  of: FnRef
  g: FnRef
  a: EvalFn
  b: EvalFn
}

export interface IntersectItem extends ItemBase {
  t: 'intersect'
  aName: string
  bName: string
  /** ff: 곡선×곡선(f−g의 근), fi: 곡선×음함수(F(x, f(x))의 근) */
  kind: 'ff' | 'fi'
  f: FnRef
  g?: FnRef
  /** env + x, y (fi) */
  F?: EvalFn
}

export interface PointItem extends ItemBase {
  t: 'point'
  label: string
  /** 곡선 위 점: of + at / 자유 점: px + py */
  of?: FnRef
  at?: EvalFn
  px?: EvalFn
  py?: EvalFn
}

export interface SegmentItem extends ItemBase {
  t: 'vector' | 'segment'
  x1: EvalFn
  y1: EvalFn
  x2: EvalFn
  y2: EvalFn
}

export interface LineItem extends ItemBase {
  t: 'line'
  px: EvalFn
  py: EvalFn
  slope: EvalFn
}

export interface LabelItem extends ItemBase {
  t: 'label'
  px: EvalFn
  py: EvalFn
  text: string
}

export type SceneItem =
  | CurveItem
  | ImplicitItem
  | RegionItem
  | PolarItem
  | ParametricItem
  | SeqItem
  | FieldItem
  | TangentItem
  | SecantItem
  | IntegralItem
  | RiemannItem
  | AreaItem
  | IntersectItem
  | PointItem
  | SegmentItem
  | LineItem
  | LabelItem

export interface SceneSection {
  title?: string
  view: SectionView
  items: SceneItem[]
  /** `hide hover` — 구역의 호버 크로스헤어·readout 전체 비활성 */
  hoverHidden: boolean
}

export interface Scene {
  params: ParamDef[]
  /** 상수 선언(k = 3)의 평가 결과 — 렌더는 param 값과 병합해 env를 만든다 */
  consts: Record<string, number>
  animations: AnimateDef[]
  sections: SceneSection[]
}

/** 아이템 표시 여부 — hide id(전체) 또는 hide id.슬롯 */
export function isShown(item: { hidden: ReadonlySet<string> }, slot: string): boolean {
  return !item.hidden.has('*') && !item.hidden.has(slot)
}
