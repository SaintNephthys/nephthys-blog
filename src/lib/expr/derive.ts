/**
 * AST 기호 미분 — 접선(tangent)·도함수 곡선(f')의 정확한 기울기를 위해
 * 수치 미분 대신 기호적으로 미분한다. 매끄럽지 않은 내장 함수(floor 등)는
 * 거의 모든 점에서 도함수 0으로 처리하고, 규칙이 없는 경우(nCr·fact 등)는
 * NonDifferentiableError를 던진다 — 호출부(FnRegistry)가 수치 미분으로 폴백.
 */

import type { Expr } from './ast'

export class NonDifferentiableError extends Error {}

const ZERO: Expr = { t: 'num', v: 0 }
const ONE: Expr = { t: 'num', v: 1 }

const isNum = (e: Expr, v?: number): e is { t: 'num'; v: number } =>
  e.t === 'num' && (v === undefined || e.v === v)

/** 얕은 상수 접기 — 미분 결과 트리가 0·1 항으로 비대해지는 것을 막는다 */
function bin(op: '+' | '-' | '*' | '/' | '^', l: Expr, r: Expr): Expr {
  if (op === '+') {
    if (isNum(l, 0)) return r
    if (isNum(r, 0)) return l
  }
  if (op === '-' && isNum(r, 0)) return l
  if (op === '*') {
    if (isNum(l, 0) || isNum(r, 0)) return ZERO
    if (isNum(l, 1)) return r
    if (isNum(r, 1)) return l
  }
  if (op === '/' && isNum(l, 0)) return ZERO
  if (op === '^' && isNum(r, 1)) return l
  if (isNum(l) && isNum(r)) {
    const v =
      op === '+' ? l.v + r.v
      : op === '-' ? l.v - r.v
      : op === '*' ? l.v * r.v
      : op === '/' ? l.v / r.v
      : Math.pow(l.v, r.v)
    if (Number.isFinite(v)) return { t: 'num', v }
  }
  return { t: 'bin', op, l, r }
}

const neg = (e: Expr): Expr => (isNum(e) ? { t: 'num', v: -e.v } : { t: 'neg', e })
const call = (name: string, ...args: Expr[]): Expr => ({ t: 'call', name, order: 0, args })

/** 1인자 내장 함수의 도함수 규칙 — du는 내부 식의 도함수(연쇄 법칙) */
function unaryRule(name: string, u: Expr, du: Expr): Expr {
  switch (name) {
    case 'sin':
      return bin('*', call('cos', u), du)
    case 'cos':
      return neg(bin('*', call('sin', u), du))
    case 'tan':
      return bin('/', du, bin('^', call('cos', u), { t: 'num', v: 2 }))
    case 'asin':
      return bin('/', du, call('sqrt', bin('-', ONE, bin('^', u, { t: 'num', v: 2 }))))
    case 'acos':
      return neg(bin('/', du, call('sqrt', bin('-', ONE, bin('^', u, { t: 'num', v: 2 })))))
    case 'atan':
      return bin('/', du, bin('+', ONE, bin('^', u, { t: 'num', v: 2 })))
    case 'sinh':
      return bin('*', call('cosh', u), du)
    case 'cosh':
      return bin('*', call('sinh', u), du)
    case 'tanh':
      return bin('/', du, bin('^', call('cosh', u), { t: 'num', v: 2 }))
    case 'sqrt':
      return bin('/', du, bin('*', { t: 'num', v: 2 }, call('sqrt', u)))
    case 'cbrt':
      return bin('/', du, bin('*', { t: 'num', v: 3 }, bin('^', call('cbrt', u), { t: 'num', v: 2 })))
    case 'exp':
      return bin('*', call('exp', u), du)
    case 'ln':
    case 'log':
      return bin('/', du, u)
    case 'log10':
      return bin('/', du, bin('*', u, { t: 'num', v: Math.LN10 }))
    case 'log2':
      return bin('/', du, bin('*', u, { t: 'num', v: Math.LN2 }))
    case 'abs':
      return bin('*', call('sign', u), du)
    // 계단형 — 거의 모든 점에서 기울기 0 (점프는 미분 불능점)
    case 'sign':
    case 'floor':
    case 'ceil':
    case 'round':
      return ZERO
    default:
      throw new NonDifferentiableError(`${name}의 도함수 규칙이 없습니다`)
  }
}

/** e를 wrt로 기호 미분한 AST를 돌려준다. 사용자 함수 호출은 order+1 (연쇄 법칙) */
export function deriveExpr(e: Expr, wrt: string, isUserFn: (name: string) => boolean): Expr {
  const d = (x: Expr): Expr => deriveExpr(x, wrt, isUserFn)
  switch (e.t) {
    case 'num':
      return ZERO
    case 'var':
      return e.name === wrt ? ONE : ZERO
    case 'neg':
      return neg(d(e.e))
    case 'bin': {
      const { op, l, r } = e
      if (op === '+' || op === '-') return bin(op, d(l), d(r))
      if (op === '*') return bin('+', bin('*', d(l), r), bin('*', l, d(r)))
      if (op === '/')
        return bin(
          '/',
          bin('-', bin('*', d(l), r), bin('*', l, d(r))),
          bin('^', r, { t: 'num', v: 2 }),
        )
      // ^: 지수가 상수면 멱법칙, 아니면 일반형 u^v·(v'·ln u + v·u'/u)
      const dl = d(l)
      const dr = d(r)
      if (isNum(dr, 0))
        return bin('*', bin('*', r, bin('^', l, bin('-', r, ONE))), dl)
      return bin(
        '*',
        bin('^', l, r),
        bin('+', bin('*', dr, call('ln', l)), bin('*', r, bin('/', dl, l))),
      )
    }
    case 'cmp':
      throw new NonDifferentiableError('비교식은 미분할 수 없습니다')
    case 'if':
      // 조건은 그대로 두고 분기만 미분 — 경계점은 미분 불능점으로 간주
      return { t: 'if', cond: e.cond, a: d(e.a), b: d(e.b) }
    case 'sum':
      if (e.binder === wrt) return ZERO
      return { t: 'sum', binder: e.binder, from: e.from, to: e.to, body: d(e.body) }
    case 'call': {
      if (isUserFn(e.name)) {
        // f(u) → f'(u)·u' (사용자 함수는 1인자)
        const u = e.args[0]
        return bin('*', { t: 'call', name: e.name, order: e.order + 1, args: [u] }, d(u))
      }
      if (e.args.length === 1) return unaryRule(e.name, e.args[0], d(e.args[0]))
      const [a, b] = e.args
      switch (e.name) {
        case 'pow':
          return d(bin('^', a, b))
        case 'min':
          return { t: 'if', cond: { t: 'cmp', op: '<=', l: a, r: b }, a: d(a), b: d(b) }
        case 'max':
          return { t: 'if', cond: { t: 'cmp', op: '>=', l: a, r: b }, a: d(a), b: d(b) }
        case 'atan2': {
          const denom = bin('+', bin('^', a, { t: 'num', v: 2 }), bin('^', b, { t: 'num', v: 2 }))
          return bin('/', bin('-', bin('*', d(a), b), bin('*', a, d(b))), denom)
        }
        default:
          throw new NonDifferentiableError(`${e.name}의 도함수 규칙이 없습니다`)
      }
    }
  }
}
