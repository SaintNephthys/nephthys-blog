/**
 * 식 AST — 파서·컴파일러·기호 미분·문장 분류(scene)가 공유하는 단일 원천.
 * 클로저를 바로 만들던 구 mathExpr와 달리 AST를 거친다 — 기호 미분(접선·도함수
 * 곡선)과 자유변수 기반 문장 분류가 AST를 요구하기 때문.
 */

export type CmpOp = '<' | '<=' | '>' | '>='
export type BinOp = '+' | '-' | '*' | '/' | '^'

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; e: Expr }
  | { t: 'bin'; op: BinOp; l: Expr; r: Expr }
  /** 비교 — if()의 조건 자리에서만 파싱된다 (1/0 평가) */
  | { t: 'cmp'; op: CmpOp; l: Expr; r: Expr }
  /** 함수 호출 — 내장/사용자 구분·인자 수 검증은 컴파일 시점. order = ' 미분 차수 */
  | { t: 'call'; name: string; order: number; args: Expr[] }
  | { t: 'if'; cond: Expr; a: Expr; b: Expr }
  | { t: 'sum'; binder: string; from: Expr; to: Expr; body: Expr }

/** 자유변수 수집 — sum 바인더는 본문에서 제외. 상수(pi 등)도 이름으로 포함된다 */
export function freeVars(
  e: Expr,
  out: Set<string> = new Set(),
  bound: ReadonlySet<string> = new Set(),
): Set<string> {
  switch (e.t) {
    case 'num':
      break
    case 'var':
      if (!bound.has(e.name)) out.add(e.name)
      break
    case 'neg':
      freeVars(e.e, out, bound)
      break
    case 'bin':
    case 'cmp':
      freeVars(e.l, out, bound)
      freeVars(e.r, out, bound)
      break
    case 'call':
      for (const a of e.args) freeVars(a, out, bound)
      break
    case 'if':
      freeVars(e.cond, out, bound)
      freeVars(e.a, out, bound)
      freeVars(e.b, out, bound)
      break
    case 'sum': {
      freeVars(e.from, out, bound)
      freeVars(e.to, out, bound)
      freeVars(e.body, out, new Set([...bound, e.binder]))
      break
    }
  }
  return out
}

/** 호출된 함수 이름 수집 — 사용자 함수 재귀(순환 정의) 검출용 */
export function calledNames(e: Expr, out: Set<string> = new Set()): Set<string> {
  switch (e.t) {
    case 'call':
      out.add(e.name)
      for (const a of e.args) calledNames(a, out)
      break
    case 'neg':
      calledNames(e.e, out)
      break
    case 'bin':
    case 'cmp':
      calledNames(e.l, out)
      calledNames(e.r, out)
      break
    case 'if':
      calledNames(e.cond, out)
      calledNames(e.a, out)
      calledNames(e.b, out)
      break
    case 'sum':
      calledNames(e.from, out)
      calledNames(e.to, out)
      calledNames(e.body, out)
      break
    default:
      break
  }
  return out
}
