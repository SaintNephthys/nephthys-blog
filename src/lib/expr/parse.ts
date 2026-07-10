/**
 * 식 파서 — 재귀 하강으로 소스 문자열을 AST(ast.ts)로 만든다.
 *
 * 구 mathExpr 대비 확장(전부 하위 호환 widening):
 * - 곱셈 생략: **직전 토큰이 숫자 또는 ')'일 때만** — `2x`, `3sin(x)`, `(x+1)(x-1)`.
 *   식별자끼리(`ab`)는 `*` 필수 — 미선언 식별자 오류로 시끄럽게 거부된다.
 * - 유니코드 별칭: θ→theta, π→pi, τ→tau, ·×→*, −→-, ≤≥→<= >= (정규형은 ASCII).
 * - `f'(x)` 프라임 미분 표기(order로 기록, 사용자 함수만 — 컴파일 시 검증).
 * - `if(조건, 참, 거짓)` — 비교 연산은 if의 조건 자리에서만 허용.
 * - `sum(k, a, b, 식)` — k는 본문에서만 유효한 바인더.
 */

import type { Expr } from './ast'

interface Token {
  type: 'num' | 'ident' | 'op'
  value: string
  pos: number
}

const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const IDENT_RE = /^[a-zA-Z][a-zA-Z0-9]*/
const TWO_CHAR_OPS = ['<=', '>=']
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '^', '(', ')', ',', '<', '>', "'"])

/** 저자 친화 유니코드 별칭 → ASCII 정규형 (문서·게시물 정규형은 ASCII) */
const ALIASES: Array<[RegExp, string]> = [
  [/θ/g, ' theta '],
  [/π/g, ' pi '],
  [/τ/g, ' tau '],
  [/[·×]/g, '*'],
  [/−/g, '-'],
  [/≤/g, '<='],
  [/≥/g, '>='],
]

export function normalizeAliases(src: string): string {
  let s = src
  for (const [re, to] of ALIASES) s = s.replace(re, to)
  return s
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    const rest = src.slice(i)
    const two = TWO_CHAR_OPS.find((op) => rest.startsWith(op))
    if (two) {
      tokens.push({ type: 'op', value: two, pos: i })
      i += 2
      continue
    }
    const num = NUM_RE.exec(rest)
    if (num) {
      tokens.push({ type: 'num', value: num[0], pos: i })
      i += num[0].length
      continue
    }
    const ident = IDENT_RE.exec(rest)
    if (ident) {
      tokens.push({ type: 'ident', value: ident[0], pos: i })
      i += ident[0].length
      continue
    }
    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === '_')
      throw new Error(`'_'는 식 안에서 쓸 수 없습니다 (수열 첨자 a_n은 좌변 전용)`)
    throw new Error(`식의 ${i + 1}번째 문자를 해석할 수 없습니다: '${ch}'`)
  }
  return tokens
}

/**
 * 식을 AST로 파싱한다. `allowCompare`가 true면 최상위에서 비교 연산 하나를
 * 허용한다(if 조건 자리 전용 — 일반 식에서 비교가 보이면 시끄럽게 거부).
 */
export function parseExpr(src: string, allowCompare = false): Expr {
  if (!src.trim()) throw new Error('식이 비어 있습니다')
  const tokens = tokenize(normalizeAliases(src))
  let idx = 0

  const peek = (): Token | undefined => tokens[idx]
  const prev = (): Token | undefined => tokens[idx - 1]
  const takeOp = (op: string): boolean => {
    const t = tokens[idx]
    if (t && t.type === 'op' && t.value === op) {
      idx += 1
      return true
    }
    return false
  }

  function parseCompare(): Expr {
    const l = parseAdditive()
    for (const op of ['<=', '>=', '<', '>'] as const) {
      if (takeOp(op)) {
        const r = parseAdditive()
        return { t: 'cmp', op, l, r }
      }
    }
    return l
  }

  function parseAdditive(): Expr {
    let left = parseMultiplicative()
    for (;;) {
      if (takeOp('+')) left = { t: 'bin', op: '+', l: left, r: parseMultiplicative() }
      else if (takeOp('-')) left = { t: 'bin', op: '-', l: left, r: parseMultiplicative() }
      else return left
    }
  }

  /** 직전 토큰이 숫자·')'이고 다음이 피연산자 시작이면 곱셈 생략으로 본다 */
  function juxtaposed(): boolean {
    const p = prev()
    const n = peek()
    if (!p || !n) return false
    const leftOk = p.type === 'num' || (p.type === 'op' && p.value === ')')
    const rightOk =
      n.type === 'num' || n.type === 'ident' || (n.type === 'op' && n.value === '(')
    return leftOk && rightOk
  }

  function parseMultiplicative(): Expr {
    let left = parseUnary()
    for (;;) {
      if (takeOp('*')) left = { t: 'bin', op: '*', l: left, r: parseUnary() }
      else if (takeOp('/')) left = { t: 'bin', op: '/', l: left, r: parseUnary() }
      else if (juxtaposed()) left = { t: 'bin', op: '*', l: left, r: parseUnary() }
      else return left
    }
  }

  function parseUnary(): Expr {
    if (takeOp('-')) return { t: 'neg', e: parseUnary() }
    if (takeOp('+')) return parseUnary()
    return parsePower()
  }

  // 우결합: 2^3^2 = 2^(3^2), 지수부는 unary라서 2^-3도 허용. -x^2는 -(x^2).
  function parsePower(): Expr {
    const base = parsePrimary()
    if (takeOp('^')) return { t: 'bin', op: '^', l: base, r: parseUnary() }
    return base
  }

  function parseArgs(name: string): Expr[] {
    // if의 조건(첫 인자)만 비교 연산 허용
    const first = name === 'if' ? parseCompare() : parseAdditive()
    const args: Expr[] = [first]
    while (takeOp(',')) args.push(parseAdditive())
    if (!takeOp(')')) throw new Error(`${name}( 의 닫는 괄호가 없습니다`)
    return args
  }

  function parsePrimary(): Expr {
    const t = peek()
    if (!t) throw new Error('식이 예상보다 일찍 끝났습니다')

    if (t.type === 'num') {
      idx += 1
      return { t: 'num', v: Number(t.value) }
    }

    if (t.type === 'ident') {
      idx += 1
      const name = t.value
      let order = 0
      while (takeOp("'")) order += 1
      if (takeOp('(')) {
        const args = parseArgs(name)
        if (name === 'if') {
          if (order > 0) throw new Error(`if에는 ' 표기를 쓸 수 없습니다`)
          if (args.length !== 3) throw new Error(`if(조건, 참값, 거짓값) — 인자 3개가 필요합니다`)
          return { t: 'if', cond: args[0], a: args[1], b: args[2] }
        }
        if (name === 'sum') {
          if (order > 0) throw new Error(`sum에는 ' 표기를 쓸 수 없습니다`)
          if (args.length !== 4)
            throw new Error(`sum(변수, 시작, 끝, 식) — 인자 4개가 필요합니다`)
          const binder = args[0]
          if (binder.t !== 'var')
            throw new Error(`sum의 첫 인자는 합 변수 이름이어야 합니다 (예: sum(k, 0, n, x^k))`)
          return { t: 'sum', binder: binder.name, from: args[1], to: args[2], body: args[3] }
        }
        return { t: 'call', name, order, args }
      }
      if (order > 0)
        throw new Error(`'${name}${"'".repeat(order)}'는 호출 형태로 씁니다 (예: ${name}'(x))`)
      return { t: 'var', name }
    }

    if (takeOp('(')) {
      const inner = parseAdditive()
      if (!takeOp(')')) throw new Error('닫는 괄호가 없습니다')
      return inner
    }

    throw new Error(`식의 ${t.pos + 1}번째 위치에 예상치 못한 토큰: '${t.value}'`)
  }

  const expr = allowCompare ? parseCompare() : parseAdditive()
  const trailing = peek()
  if (trailing) {
    const hint =
      trailing.type === 'ident' ? ' — 식별자끼리의 곱셈은 *를 씁니다 (예: a*b)' : ''
    throw new Error(
      `식의 ${trailing.pos + 1}번째 위치에 예상치 못한 토큰: '${trailing.value}'${hint}`,
    )
  }
  return expr
}
