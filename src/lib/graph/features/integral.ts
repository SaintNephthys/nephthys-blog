/**
 * integral 기능 — `integral = [시작, 끝]` (경계는 숫자 또는 param 식 문자열).
 * 파싱과 수치 적분(합성 심프슨)을 함께 소유한다.
 */

import { compileExpression, type EvalFn } from '../../mathExpr'

export interface GraphIntegral {
  fromSource: string
  toSource: string
  /** 경계식 — param 값만으로 평가된다 (x 불가) */
  from: EvalFn
  to: EvalFn
}

const SIMPSON_STEPS = 1000

/** 적분 경계 — 숫자는 상수로, 문자열은 param 식으로 컴파일 */
function compileBound(
  v: unknown,
  which: string,
  paramNames: string[],
): { source: string; fn: EvalFn } {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return { source: String(v), fn: () => v }
  }
  if (typeof v === 'string') {
    try {
      return { source: v.trim(), fn: compileExpression(v, paramNames) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`integral ${which}: ${msg}`, { cause: e })
    }
  }
  throw new Error(`integral ${which}은(는) 숫자 또는 문자열(param 식)이어야 합니다`)
}

export function parseIntegral(v: unknown, paramNames: string[]): GraphIntegral {
  if (!Array.isArray(v) || v.length !== 2)
    throw new Error(`integral은 [시작, 끝] 형태의 배열이어야 합니다 (예: [0, "t"])`)
  const from = compileBound(v[0], '시작값', paramNames)
  const to = compileBound(v[1], '끝값', paramNames)
  return { fromSource: from.source, toSource: to.source, from: from.fn, to: to.fn }
}

/** 합성 심프슨 공식 — 구간 내 비유한값이 있으면 NaN으로 흘러나온다 */
export function integrate(evalAt: (x: number) => number, lo: number, hi: number): number {
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
