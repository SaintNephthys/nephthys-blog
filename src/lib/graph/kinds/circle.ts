/**
 * kind = "circle" — 단위원 + param 각도를 따라 회전하는 반지름.
 * 키: angle(필수, 라디안이 되는 param 식)·title·display. fn 계열 키는 금지.
 */

import { compileExpression, type EvalFn } from '../../mathExpr'
import { parseFlags, parseTitle } from '../primitives'
import type { ParseContext, PlotKindModule } from './contract'

/** 표시 항목 — 기본 전부 false. 각 항목은 readout + 대응 시각 요소 쌍 */
export interface CircleDisplay {
  theta: boolean
  cos: boolean
  sin: boolean
}

export interface CirclePlotSpec {
  kind: 'circle'
  title?: string
  angleSource: string
  angle: EvalFn
  display: CircleDisplay
}

export const circleKind: PlotKindModule<CirclePlotSpec> = {
  kind: 'circle',
  plotKeys: ['kind', 'title', 'angle', 'display'],

  parse(v: Record<string, unknown>, ctx: ParseContext): CirclePlotSpec {
    const { label, paramNames } = ctx
    for (const forbidden of ['fn', 'domain', 'range', 'integral', 'point']) {
      if (forbidden in v)
        throw new Error(`${label}: kind = "circle"에서는 '${forbidden}'을(를) 쓸 수 없습니다`)
    }
    const title = parseTitle(v, label)
    if (!('angle' in v))
      throw new Error(`${label}에 'angle = "<식>"' 항목이 필요합니다 (kind = "circle")`)
    if (typeof v.angle !== 'string' || !v.angle.trim())
      throw new Error(`${label}의 angle은 식을 담은 문자열이어야 합니다 (따옴표로 감쌀 것)`)
    const angleSource = v.angle.trim()
    let angle: EvalFn
    try {
      angle = compileExpression(angleSource, paramNames)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`${label} angle: ${msg}`, { cause: e })
    }
    const display = parseFlags(v.display, label, [
      'theta',
      'cos',
      'sin',
    ]) as unknown as CircleDisplay
    return { kind: 'circle', title, angleSource, angle, display }
  },
}
