/**
 * AST → (변수맵) => number 클로저 컴파일러.
 *
 * 구 mathExpr의 불변식 유지: **컴파일된 클로저는 예외를 던지지 않는다** —
 * 정의역 밖은 NaN/Infinity로 흘러나오고 그래프 쪽에서 gap 처리한다.
 * 미선언 식별자·인자 수 오류는 컴파일 시점에 시끄럽게 던진다.
 *
 * 사용자 함수(f(x) = …)는 FnRegistry가 소유 — 본문 컴파일과 도함수(기호 미분,
 * 실패 시 수치 미분 폴백) 클로저를 order별로 캐시한다.
 */

import type { Expr } from './ast'
import { BINARY_FUNCS, CONSTANTS, UNARY_FUNCS } from './builtins'
import { deriveExpr, NonDifferentiableError } from './derive'

export type EvalFn = (vars: Record<string, number>) => number

export interface UserFnDef {
  formal: string
  body: Expr
}

const NUMERIC_H = 1e-5

/** 사용자 함수 레지스트리 — 이름 → (formal, 본문 AST) + order별 도함수 캐시 */
export class FnRegistry {
  private defs = new Map<string, UserFnDef>()
  private cache = new Map<string, EvalFn>()
  /** 본문에서 허용되는 스칼라 이름(param·상수) — scene이 설정 */
  scalarNames: ReadonlySet<string> = new Set()

  define(name: string, formal: string, body: Expr): void {
    this.defs.set(name, { formal, body })
  }

  has(name: string): boolean {
    return this.defs.has(name)
  }

  get(name: string): UserFnDef | undefined {
    return this.defs.get(name)
  }

  names(): string[] {
    return [...this.defs.keys()]
  }

  /**
   * name의 order계 도함수 평가 클로저 — env에는 formal 이름으로 인자를 담는다.
   * 기호 미분이 안 되는 본문은 한 단계 아래 도함수의 중앙차분으로 폴백.
   */
  evalOf(name: string, order: number): EvalFn {
    const key = `${name}'${order}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const def = this.defs.get(name)
    if (!def) throw new Error(`알 수 없는 함수: ${name}()`)
    let fn: EvalFn
    if (order === 0) {
      fn = compileAst(def.body, new Set([...this.scalarNames, def.formal]), this)
    } else {
      try {
        let body = def.body
        for (let i = 0; i < order; i += 1)
          body = deriveExpr(body, def.formal, (n) => this.defs.has(n))
        fn = compileAst(body, new Set([...this.scalarNames, def.formal]), this)
      } catch (err) {
        if (!(err instanceof NonDifferentiableError)) throw err
        const lower = this.evalOf(name, order - 1)
        const formal = def.formal
        fn = (env) => {
          const v = env[formal]
          const e2 = { ...env }
          e2[formal] = v + NUMERIC_H
          const hi = lower(e2)
          e2[formal] = v - NUMERIC_H
          const lo = lower(e2)
          return (hi - lo) / (2 * NUMERIC_H)
        }
      }
    }
    this.cache.set(key, fn)
    return fn
  }
}

/**
 * AST를 클로저로 컴파일한다. `vars`에 없는 식별자(상수 제외)는 컴파일 시점 오류 —
 * 이름 오타를 저작 중에 바로 잡기 위함(구 mathExpr와 동일한 계약).
 */
export function compileAst(e: Expr, vars: ReadonlySet<string>, fns: FnRegistry): EvalFn {
  switch (e.t) {
    case 'num': {
      const v = e.v
      return () => v
    }
    case 'var': {
      const name = e.name
      if (vars.has(name)) return (env) => env[name]
      if (name in CONSTANTS) {
        const c = CONSTANTS[name]
        return () => c
      }
      throw new Error(`알 수 없는 식별자: '${name}' (param 또는 상수로 먼저 선언)`)
    }
    case 'neg': {
      const inner = compileAst(e.e, vars, fns)
      return (env) => -inner(env)
    }
    case 'bin': {
      const l = compileAst(e.l, vars, fns)
      const r = compileAst(e.r, vars, fns)
      switch (e.op) {
        case '+':
          return (env) => l(env) + r(env)
        case '-':
          return (env) => l(env) - r(env)
        case '*':
          return (env) => l(env) * r(env)
        case '/':
          return (env) => l(env) / r(env)
        case '^':
          return (env) => Math.pow(l(env), r(env))
      }
      break
    }
    case 'cmp': {
      const l = compileAst(e.l, vars, fns)
      const r = compileAst(e.r, vars, fns)
      const op = e.op
      return (env) => {
        const a = l(env)
        const b = r(env)
        if (Number.isNaN(a) || Number.isNaN(b)) return NaN
        switch (op) {
          case '<':
            return a < b ? 1 : 0
          case '<=':
            return a <= b ? 1 : 0
          case '>':
            return a > b ? 1 : 0
          case '>=':
            return a >= b ? 1 : 0
        }
      }
    }
    case 'if': {
      const cond = compileAst(e.cond, vars, fns)
      const a = compileAst(e.a, vars, fns)
      const b = compileAst(e.b, vars, fns)
      return (env) => {
        const c = cond(env)
        if (Number.isNaN(c)) return NaN
        return c !== 0 ? a(env) : b(env)
      }
    }
    case 'sum': {
      const binder = e.binder
      if (vars.has(binder) || binder in CONSTANTS)
        throw new Error(`sum 변수 '${binder}'이(가) 기존 이름과 충돌합니다`)
      const from = compileAst(e.from, vars, fns)
      const to = compileAst(e.to, vars, fns)
      const body = compileAst(e.body, new Set([...vars, binder]), fns)
      return (env) => {
        const a = Math.round(from(env))
        const b = Math.round(to(env))
        if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
        if (b - a > 10000) return NaN // 폭주 방지
        let acc = 0
        const e2 = { ...env }
        for (let k = a; k <= b; k += 1) {
          e2[binder] = k
          acc += body(e2)
        }
        return acc
      }
    }
    case 'call': {
      const { name, order, args } = e
      const def = fns.get(name)
      if (def) {
        if (args.length !== 1)
          throw new Error(`${name}()는 인수 1개를 받습니다 (${args.length}개 전달됨)`)
        const arg = compileAst(args[0], vars, fns)
        const g = fns.evalOf(name, order)
        const formal = def.formal
        return (env) => {
          const e2 = { ...env }
          e2[formal] = arg(env)
          return g(e2)
        }
      }
      if (order > 0)
        throw new Error(`' 미분 표기는 정의한 함수에만 쓸 수 있습니다 (${name}은 내장 함수)`)
      const unary = UNARY_FUNCS[name]
      if (unary) {
        if (args.length !== 1)
          throw new Error(`${name}()는 인수 1개를 받습니다 (${args.length}개 전달됨)`)
        const a = compileAst(args[0], vars, fns)
        return (env) => unary(a(env))
      }
      const binary = BINARY_FUNCS[name]
      if (binary) {
        if (args.length !== 2)
          throw new Error(`${name}()는 인수 2개를 받습니다 (${args.length}개 전달됨)`)
        const a = compileAst(args[0], vars, fns)
        const b = compileAst(args[1], vars, fns)
        return (env) => binary(a(env), b(env))
      }
      throw new Error(`알 수 없는 함수: ${name}() — 함수는 '${name}(x) = 식'으로 정의합니다`)
    }
  }
  throw new Error('컴파일할 수 없는 식입니다')
}
