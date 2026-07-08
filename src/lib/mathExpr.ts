/**
 * 함수 그래프(```graph 펜스)용 수식 컴파일러 — 외부 파서 의존성 없이
 * `a * sin(b * x)` 형태의 식을 (변수맵) => number 클로저로 컴파일한다.
 *
 * 지원 문법: 숫자(지수 표기 포함) · 변수 · 상수(pi, e, tau) · + - * / ^ ·
 * 단항 부호 · 괄호 · 함수 호출. 곱셈 기호 생략(`2x`)은 지원하지 않는다
 * (나중에 추가해도 기존 글과 호환되지만, 제거는 불가능하므로 보수적으로 시작).
 *
 * 컴파일된 클로저는 예외를 던지지 않는다 — 정의역 밖 입력은 NaN/Infinity로
 * 흘러나오고, 그래프 쪽에서 유한값 검사로 끊어진 구간(gap) 처리한다.
 */

export type EvalFn = (vars: Record<string, number>) => number

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
}

const UNARY_FUNCS: Record<string, (a: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
}

const BINARY_FUNCS: Record<string, (a: number, b: number) => number> = {
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  atan2: Math.atan2,
}

interface Token {
  type: 'num' | 'ident' | 'op'
  value: string
  pos: number
}

const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*/
const OPS = new Set(['+', '-', '*', '/', '^', '(', ')', ','])

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
    if (OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i })
      i += 1
      continue
    }
    throw new Error(`식의 ${i + 1}번째 문자를 해석할 수 없습니다: '${ch}'`)
  }
  return tokens
}

/**
 * 식을 컴파일한다. `variables`에 없는 식별자(상수·함수 제외)는
 * 컴파일 시점에 오류 — 파라미터 이름 오타를 저작 중에 바로 잡기 위함.
 */
export function compileExpression(src: string, variables: string[]): EvalFn {
  if (!src.trim()) throw new Error('식이 비어 있습니다')
  const tokens = tokenize(src)
  const vars = new Set(variables)
  let idx = 0

  const peek = (): Token | undefined => tokens[idx]
  const takeOp = (op: string): boolean => {
    const t = tokens[idx]
    if (t && t.type === 'op' && t.value === op) {
      idx += 1
      return true
    }
    return false
  }

  function parseAdditive(): EvalFn {
    let left = parseMultiplicative()
    for (;;) {
      if (takeOp('+')) {
        const l = left
        const r = parseMultiplicative()
        left = (v) => l(v) + r(v)
      } else if (takeOp('-')) {
        const l = left
        const r = parseMultiplicative()
        left = (v) => l(v) - r(v)
      } else {
        return left
      }
    }
  }

  function parseMultiplicative(): EvalFn {
    let left = parseUnary()
    for (;;) {
      if (takeOp('*')) {
        const l = left
        const r = parseUnary()
        left = (v) => l(v) * r(v)
      } else if (takeOp('/')) {
        const l = left
        const r = parseUnary()
        left = (v) => l(v) / r(v)
      } else {
        return left
      }
    }
  }

  function parseUnary(): EvalFn {
    if (takeOp('-')) {
      const operand = parseUnary()
      return (v) => -operand(v)
    }
    if (takeOp('+')) return parseUnary()
    return parsePower()
  }

  // 우결합: 2^3^2 = 2^(3^2), 지수부는 unary라서 2^-3도 허용. -x^2는 -(x^2).
  function parsePower(): EvalFn {
    const base = parsePrimary()
    if (takeOp('^')) {
      const exp = parseUnary()
      return (v) => Math.pow(base(v), exp(v))
    }
    return base
  }

  function parsePrimary(): EvalFn {
    const t = peek()
    if (!t) throw new Error('식이 예상보다 일찍 끝났습니다')

    if (t.type === 'num') {
      idx += 1
      const n = Number(t.value)
      return () => n
    }

    if (t.type === 'ident') {
      idx += 1
      const name = t.value
      if (takeOp('(')) {
        const args: EvalFn[] = [parseAdditive()]
        while (takeOp(',')) args.push(parseAdditive())
        if (!takeOp(')')) throw new Error(`${name}( 의 닫는 괄호가 없습니다`)
        const unary = UNARY_FUNCS[name]
        if (unary) {
          if (args.length !== 1)
            throw new Error(`${name}()는 인수 1개를 받습니다 (${args.length}개 전달됨)`)
          const a = args[0]
          return (v) => unary(a(v))
        }
        const binary = BINARY_FUNCS[name]
        if (binary) {
          if (args.length !== 2)
            throw new Error(`${name}()는 인수 2개를 받습니다 (${args.length}개 전달됨)`)
          const a = args[0]
          const b = args[1]
          return (v) => binary(a(v), b(v))
        }
        throw new Error(`알 수 없는 함수: ${name}()`)
      }
      if (name in CONSTANTS) {
        const c = CONSTANTS[name]
        return () => c
      }
      if (vars.has(name)) return (v) => v[name]
      throw new Error(`알 수 없는 식별자: '${name}' (변수로 쓰려면 param으로 선언)`)
    }

    if (takeOp('(')) {
      const inner = parseAdditive()
      if (!takeOp(')')) throw new Error('닫는 괄호가 없습니다')
      return inner
    }

    throw new Error(`식의 ${t.pos + 1}번째 위치에 예상치 못한 토큰: '${t.value}'`)
  }

  const fn = parseAdditive()
  const trailing = peek()
  if (trailing)
    throw new Error(
      `식의 ${trailing.pos + 1}번째 위치에 예상치 못한 토큰: '${trailing.value}'`,
    )
  return fn
}

/** 식별자가 식 문법의 예약어(상수·함수)와 충돌하는지 검사 */
export function isReservedWord(name: string): boolean {
  return name in CONSTANTS || name in UNARY_FUNCS || name in BINARY_FUNCS
}
