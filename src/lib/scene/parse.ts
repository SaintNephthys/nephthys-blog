/**
 * ```graph DSL 문장 파서 — "수식이 곧 스펙"인 줄 단위 문법을 Scene IR로 만든다.
 * (TOML 스펙은 2026-07-10 폐기 — 문법 명세는 devnotes §2, 계약은 §2.5)
 *
 * 분류는 추측이 아니라 **좌변 형태 + 자유변수 집합의 결정적 규칙**으로 내려지고,
 * 판별 불능·중의·미선언 식별자는 전부 행 번호를 짚는 시끄러운 오류다(조용한
 * 오해석 금지 — 구 줄 문법을 폐기했던 이유를 계승하는 원칙).
 *
 * 처리 단계:
 *  pass 1  선언 스캔 — 함수·param·상수·라벨 이름 수집(선언 순서 무관을 위한 2-pass)
 *  pass 1.5 함수 본문 등록 + 순환 정의 검사 + 컴파일 검증
 *  wave A  param·상수 값 평가(행 순서 — 상수는 사용 전에 선언)
 *  wave B1 곡선·영역·수열·방향장 아이템 + view·animate·hide 지시문
 *  wave B2 도구 문장(tangent·integral·…) — B1의 아이템·라벨을 참조 가능
 *  finalize 색 배정·hide 적용·intersect 해석
 */

import {
  calledNames,
  compileAst,
  CONSTANTS,
  FnRegistry,
  freeVars,
  isReservedWord,
  parseExpr,
  type EvalFn,
  type Expr,
} from '../expr'
import type {
  AnimateDef,
  FnRef,
  ParamDef,
  Scene,
  SceneItem,
  SceneSection,
  SectionView,
} from './types'

const NAME = '[A-Za-z][A-Za-z0-9]*'
const TOOLS = new Set([
  'tangent',
  'secant',
  'integral',
  'riemann',
  'area',
  'intersect',
  'point',
  'vector',
  'segment',
  'line',
  'label',
])
const DIRECTIVES = new Set(['view', 'animate', 'show', 'hide', 'style'])
/** 전면 예약 변수 — 어떤 사용자 이름으로도 금지 (theta는 극곡선 판별 근거라 포함) */
const RESERVED_VARS = new Set(['x', 'y', 'theta'])
/**
 * param·상수 이름으로만 허용되는 문맥 이름 — r(극곡선 좌변)·n(수열 첨자)·
 * s(매개변수)는 해당 문장 안에서 그 문장의 바인더가 param을 섀도잉한다
 * (리만합의 n, 매개변수 범위의 s처럼 교과서 표준 기호를 param으로 쓰기 위함)
 */
const CONTEXT_SCALARS = new Set(['r', 'n', 's'])
const MAX_SECTIONS = 4

/** 아이템 타입별 표시 슬롯 — hide id.슬롯 검증용 */
const TYPE_SLOTS: Record<SceneItem['t'], readonly string[]> = {
  curve: ['curve', 'hover'],
  implicit: ['curve'],
  region: ['area'],
  polar: ['curve'],
  parametric: ['curve'],
  seq: ['points'],
  field: ['field'],
  tangent: ['line', 'value'],
  secant: ['line', 'value'],
  integral: ['area', 'value'],
  riemann: ['bars', 'value'],
  area: ['area', 'value'],
  intersect: ['marks', 'value'],
  point: ['mark', 'value'],
  vector: ['line'],
  segment: ['line'],
  line: ['line'],
  label: ['text'],
}

/* ── 문자열 유틸 (괄호·대괄호 깊이와 "문자열"을 존중하는 스캐너) ─────────── */

function stripComment(line: string): string {
  let inStr = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') inStr = !inStr
    else if (ch === '#' && !inStr) return line.slice(0, i)
  }
  return line
}

/** 최상위(depth 0, 문자열 밖) 구분자로 분할 */
function topSplit(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr = false
  let start = 0
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (ch === '"') inStr = !inStr
    if (inStr) continue
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((p) => p.trim())
}

/** 최상위에서 후보 토큰(길이 내림차순 권장)의 첫 등장 위치 */
function findTop(s: string, tokens: string[]): { tok: string; idx: number } | null {
  let depth = 0
  let inStr = false
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (ch === '"') inStr = !inStr
    if (inStr) continue
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    else if (depth === 0) {
      for (const tok of tokens) {
        if (s.startsWith(tok, i)) return { tok, idx: i }
      }
    }
  }
  return null
}

/* ── 파서 본체 ──────────────────────────────────────────────────────────── */

interface LineInfo {
  no: number
  text: string
  /** 소속 구역 인덱스 — 다중 모드에서 첫 --- 이전은 -1(공통 영역) */
  section: number
}

interface PendingHide {
  no: number
  section: number
  show: boolean
  target: string
}

interface PendingIntersect {
  no: number
  section: number
  id: string
  aName: string
  bName: string
}

export function parseGraphSource(src: string): Scene {
  const errors: string[] = []
  const fail = (no: number, msg: string): never => {
    throw new Error(`${no}행: ${msg}`)
  }
  /** 행 단위 오류를 모으고 계속 진행 — 행 번호 접두가 없으면 붙인다 */
  const attempt = (no: number, fn: () => void) => {
    try {
      fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(/^\d+행:/.test(msg) ? msg : `${no}행: ${msg}`)
    }
  }

  // ── 행 분해 + 구역 추적 ──
  const rawLines = src.split(/\r?\n/)
  const lines: LineInfo[] = []
  const sectionTitles: Array<string | undefined> = []
  let cur = -1
  for (let i = 0; i < rawLines.length; i += 1) {
    const text = stripComment(rawLines[i]).trim()
    if (!text) continue
    if (text.startsWith('---')) {
      const title = text.slice(3).trim()
      sectionTitles.push(title || undefined)
      cur += 1
      continue
    }
    lines.push({ no: i + 1, text, section: cur })
  }
  const multi = sectionTitles.length > 0
  const sectionCount = multi ? sectionTitles.length : 1
  if (multi && sectionTitles.length > MAX_SECTIONS)
    throw new Error(`구역(---)은 최대 ${MAX_SECTIONS}개까지 지원합니다 (현재 ${sectionTitles.length}개)`)
  if (!multi) for (const l of lines) l.section = 0

  // ── pass 1: 선언 스캔 ──
  const fnDecls = new Map<string, { formal: string; rhs: string; no: number; section: number }>()
  const scalarDecls: Array<{ name: string; rhs: string; no: number }> = []
  const scalarNames = new Set<string>()
  const labelNames = new Set<string>()

  const FN_DEF_RE = new RegExp(`^(${NAME})\\s*\\(\\s*(${NAME})\\s*\\)\\s*=([^=].*)$`)
  const LABEL_RE = new RegExp(`^(${NAME})\\s*:\\s*(.+)$`)
  const SCALAR_RE = new RegExp(`^(${NAME})\\s*=([^=].*)$`)

  const validateName = (name: string, no: number, kind: 'fn' | 'scalar' | 'label') => {
    if (isReservedWord(name)) fail(no, `'${name}'은(는) 상수·내장 함수 이름입니다`)
    if (RESERVED_VARS.has(name)) fail(no, `'${name}'은(는) 예약된 변수 이름입니다`)
    if (TOOLS.has(name) || DIRECTIVES.has(name)) fail(no, `'${name}'은(는) 예약된 키워드입니다`)
    if (CONTEXT_SCALARS.has(name) && kind !== 'scalar')
      fail(no, `'${name}'은(는) param·상수 이름으로만 쓸 수 있습니다 (문맥 변수와의 구분)`)
    if (fnDecls.has(name) || scalarNames.has(name) || labelNames.has(name))
      fail(no, `'${name}'이(가) 이미 선언되었습니다`)
  }

  const scanDecl = (text: string, no: number, section: number) => {
    const firstWord = /^[A-Za-z]+/.exec(text)?.[0] ?? ''
    if (DIRECTIVES.has(firstWord)) return

    const label = LABEL_RE.exec(text)
    if (label && !TOOLS.has(label[1]) && !DIRECTIVES.has(label[1])) {
      const [, name, rest] = label
      validateName(name, no, 'label')
      labelNames.add(name)
      // 라벨된 y = … 곡선은 이름으로 호출 가능한 함수로도 등록 (intersect·tangent 참조용)
      const yForm = /^y\s*=([^=].*)$/.exec(rest)
      if (yForm) fnDecls.set(name, { formal: 'x', rhs: yForm[1].trim(), no, section })
      return
    }

    const fnDef = FN_DEF_RE.exec(text)
    if (fnDef && !TOOLS.has(fnDef[1])) {
      const [, name, formal, rhs] = fnDef
      validateName(name, no, 'fn')
      if (isReservedWord(formal) || (RESERVED_VARS.has(formal) && formal !== 'x'))
        fail(no, `함수 인자 이름으로 '${formal}'을(를) 쓸 수 없습니다`)
      fnDecls.set(name, { formal, rhs: rhs.trim(), no, section })
      return
    }

    const scalar = SCALAR_RE.exec(text)
    if (scalar && scalar[1] !== 'y') {
      const [, name, rhs] = scalar
      // r = 식: 우변에 theta가 있으면 극곡선(아이템) — 스칼라 선언이 아니다
      if (name === 'r' && /theta|θ/.test(rhs)) return
      if (CONTEXT_SCALARS.has(name)) {
        if (scalarNames.has(name) || fnDecls.has(name) || labelNames.has(name))
          fail(no, `'${name}'이(가) 이미 선언되었습니다`)
      } else validateName(name, no, 'scalar')
      scalarNames.add(name)
      scalarDecls.push({ name, rhs: rhs.trim(), no })
    }
  }

  for (const l of lines) attempt(l.no, () => scanDecl(l.text, l.no, l.section))
  if (errors.length) throw new Error(errors.join('\n'))

  // ── pass 1.5: 함수 본문 등록 + 순환 검사 + 컴파일 검증 ──
  const reg = new FnRegistry()
  reg.scalarNames = scalarNames
  const fnBodies = new Map<string, Expr>()
  for (const [name, d] of fnDecls) {
    attempt(d.no, () => {
      let body: Expr
      try {
        body = parseExpr(d.rhs)
      } catch (e) {
        fail(d.no, e instanceof Error ? e.message : String(e))
        return
      }
      const free = freeVars(body)
      for (const v of free) {
        if (v !== d.formal && !scalarNames.has(v) && !(v in CONSTANTS) && !fnDecls.has(v))
          fail(d.no, `알 수 없는 식별자: '${v}' (param 또는 상수로 먼저 선언)`)
      }
      fnBodies.set(name, body)
      reg.define(name, d.formal, body)
    })
  }
  if (errors.length) throw new Error(errors.join('\n'))

  // 순환 정의(f → g → f)는 컴파일이 무한 재귀하므로 먼저 거부한다
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const checkCycle = (name: string, no: number) => {
    if (visited.has(name)) return
    if (visiting.has(name)) fail(no, `함수 '${name}'이(가) 재귀적으로 정의되었습니다 (미지원)`)
    visiting.add(name)
    const body = fnBodies.get(name)
    if (body) {
      for (const called of calledNames(body)) {
        if (fnDecls.has(called)) checkCycle(called, fnDecls.get(called)!.no)
      }
    }
    visiting.delete(name)
    visited.add(name)
  }
  for (const [name, d] of fnDecls) attempt(d.no, () => checkCycle(name, d.no))
  if (errors.length) throw new Error(errors.join('\n'))
  for (const [name, d] of fnDecls) attempt(d.no, () => void reg.evalOf(name, 0))
  if (errors.length) throw new Error(errors.join('\n'))

  // ── wave A: 상수·param 값 평가 (행 순서 — 상수는 사용 전에 선언) ──
  const consts: Record<string, number> = {}
  const params: ParamDef[] = []
  const knownConsts = new Set<string>()

  /** 상수 식(param 불가) — 지금까지 선언된 상수만 참조 가능 */
  const constEval = (srcExpr: string, no: number): number => {
    let v: number
    try {
      v = compileAst(parseExpr(srcExpr), knownConsts, reg)(consts)
    } catch (e) {
      throw new Error(`${no}행: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
    if (!Number.isFinite(v)) fail(no, `'${srcExpr}'이(가) 유한한 숫자로 계산되지 않습니다`)
    return v
  }

  for (const d of scalarDecls) {
    attempt(d.no, () => {
      const parts = topSplit(d.rhs, ':')
      if (parts.length > 2) fail(d.no, `':'가 여러 개입니다 — 'a = 1 : [최소, 최대]' 형태`)
      if (parts.length === 2) {
        // param: 이름 = 기본값 : [min, max(, step)?]
        const m = /^\[(.*)\]$/.exec(parts[1])
        if (!m) fail(d.no, `param 범위는 [최소, 최대] 또는 [최소, 최대, 스텝] 형태입니다`)
        const bounds = topSplit(m![1], ',')
        if (bounds.length < 2 || bounds.length > 3)
          fail(d.no, `param 범위는 [최소, 최대] 또는 [최소, 최대, 스텝] 형태입니다`)
        const min = constEval(bounds[0], d.no)
        const max = constEval(bounds[1], d.no)
        if (min >= max) fail(d.no, `param ${d.name}: 최솟값이 최댓값보다 작아야 합니다`)
        const step = bounds.length === 3 ? constEval(bounds[2], d.no) : (max - min) / 100
        if (step <= 0) fail(d.no, `param ${d.name}: 스텝은 0보다 커야 합니다`)
        const def = Math.min(max, Math.max(min, constEval(parts[0], d.no)))
        params.push({ name: d.name, def, min, max, step })
      } else {
        // 상수: 이름 = 숫자 식 (param 참조 불가 — 값이 고정이어야 하므로)
        consts[d.name] = constEval(parts[0], d.no)
        knownConsts.add(d.name)
      }
    })
  }

  const scalarSet: ReadonlySet<string> = scalarNames

  /* ── 식 컴파일 헬퍼 ── */

  const compileWith = (srcExpr: string, extra: readonly string[], no: number): EvalFn => {
    try {
      return compileAst(parseExpr(srcExpr), new Set([...scalarSet, ...extra]), reg)
    } catch (e) {
      throw new Error(`${no}행: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
  }
  /** param·상수만 허용하는 스칼라 식 (도구 인자·경계) */
  const scalarExpr = (srcExpr: string, no: number): EvalFn => compileWith(srcExpr, [], no)

  /** 정의된 함수를 x-호출 클로저로 (formal이 x가 아니면 이름을 바꿔 전달) */
  const xEval = (name: string, order: number, no: number): EvalFn => {
    const def = reg.get(name)
    if (!def) fail(no, `'${name}'은(는) 정의된 함수가 아닙니다`)
    const g = reg.evalOf(name, order)
    const formal = def!.formal
    if (formal === 'x') return g
    return (env) => {
      const e2 = { ...env }
      e2[formal] = env.x
      return g(e2)
    }
  }
  const fnRef = (name: string, no: number): FnRef => ({ name, evalAt: xEval(name, 0, no) })

  /* ── 구역·아이템 준비 ── */

  const sections: SceneSection[] = Array.from({ length: sectionCount }, (_, i) => ({
    title: multi ? sectionTitles[i] : undefined,
    view: { equal: false } as SectionView,
    items: [],
    hoverHidden: false,
  }))
  let defaultView: SectionView = { equal: false }
  const animations: AnimateDef[] = []
  const pendingHides: PendingHide[] = []
  const pendingIntersects: PendingIntersect[] = []

  const idCounts = new Map<string, number>()
  /** 자동 id는 구역 단위로 유일 — hide 대상이 구역 안에서 예측 가능해야 한다 */
  const makeId = (base: string, section: number): string => {
    const key = `${section}:${base}`
    const c = (idCounts.get(key) ?? 0) + 1
    idCounts.set(key, c)
    return c === 1 ? base : `${base}${c}`
  }
  const push = (section: number, item: SceneItem) => {
    sections[section].items.push(item)
  }
  const newHidden = () => new Set<string>()

  /** `이름 in [a, b]` 구간 파싱 */
  const parseRange = (piece: string, varName: string, no: number): [number, number] => {
    const m = new RegExp(`^(${NAME})\\s+in\\s*\\[(.*)\\]$`).exec(piece)
    if (!m || m[1] !== varName)
      fail(no, `'${varName} in [시작, 끝]' 형태의 구간이 필요합니다 (예: ${varName} in [0, 2pi])`)
    const parts = topSplit(m![2], ',')
    if (parts.length !== 2) fail(no, `구간은 [시작, 끝] 두 값이어야 합니다`)
    const a = constEval(parts[0], no)
    const b = constEval(parts[1], no)
    if (a >= b) fail(no, `구간의 시작이 끝보다 작아야 합니다`)
    return [a, b]
  }

  /* ── 지시문 ── */

  const parseView = (rest: string, no: number): SectionView => {
    let s = rest
    const view: SectionView = { equal: false }
    const grab = (axis: 'x' | 'y') => {
      const re = new RegExp(`(?:^|\\s)${axis}\\s*\\[([^\\]]*)\\]`)
      const m = re.exec(s)
      if (!m) return
      const parts = topSplit(m[1], ',')
      if (parts.length !== 2) fail(no, `view ${axis}는 ${axis}[최소, 최대] 형태입니다`)
      const lo = constEval(parts[0], no)
      const hi = constEval(parts[1], no)
      if (lo >= hi) fail(no, `view ${axis}: 최솟값이 최댓값보다 작아야 합니다`)
      view[axis] = [lo, hi]
      s = s.replace(m[0], ' ')
    }
    grab('x')
    grab('y')
    if (/\bequal\b/.test(s)) {
      view.equal = true
      s = s.replace(/\bequal\b/, ' ')
    }
    if (s.trim()) fail(no, `view에서 해석할 수 없는 부분: '${s.trim()}'`)
    return view
  }

  const parseAnimate = (rest: string, no: number) => {
    const m = new RegExp(`^(${NAME})\\s*:\\s*(.+)$`).exec(rest)
    if (!m) fail(no, `animate는 'animate 이름: 시작 -> 끝[, 초s][, loop|once]' 형태입니다`)
    const name = m![1]
    if (!params.some((p) => p.name === name)) fail(no, `'${name}'은(는) param이 아닙니다`)
    if (animations.some((a) => a.name === name)) fail(no, `'${name}'의 animate가 이미 있습니다`)
    const pieces = topSplit(m![2].replace(/→/g, '->'), ',')
    const range = pieces[0].split('->')
    if (range.length !== 2) fail(no, `animate 구간은 '시작 -> 끝' 형태입니다`)
    const from = constEval(range[0], no)
    const to = constEval(range[1], no)
    if (from === to) fail(no, `animate: 시작과 끝이 같습니다`)
    let duration = 4
    let loop = true
    for (const piece of pieces.slice(1)) {
      const dur = /^(\d+(?:\.\d+)?)s$/.exec(piece)
      if (dur) duration = Number(dur[1])
      else if (piece === 'loop') loop = true
      else if (piece === 'once') loop = false
      else fail(no, `animate에서 해석할 수 없는 옵션: '${piece}'`)
    }
    if (duration <= 0) fail(no, `animate 시간은 0보다 커야 합니다`)
    animations.push({ name, from, to, duration, loop })
  }

  /* ── wave B1: 아이템(비도구) + 지시문 ── */

  const DERIV_RE = new RegExp(`^(${NAME})('+)$`)
  const SEQ_RE = new RegExp(`^(${NAME})_n\\s*=([^=].*)$`)

  const buildEquation = (lhs: string, rhs: string, no: number, section: number, label?: string) => {
    // y' = 식 → 방향장
    if (/^y\s*'$/.test(lhs)) {
      const slope = compileWith(rhs, ['x', 'y'], no)
      push(section, { t: 'field', id: label ?? makeId('field', section), hidden: newHidden(), line: no, slope })
      return
    }
    // 수열 a_n = 식, n in [1, 30]
    const seq = SEQ_RE.exec(`${lhs}=${rhs}`)
    if (seq) {
      const pieces = topSplit(seq[2], ',')
      if (pieces.length !== 2) fail(no, `수열은 '이름_n = 식, n in [시작, 끝]' 형태입니다`)
      const range = parseRange(pieces[1], 'n', no)
      const term = compileWith(pieces[0], ['n'], no)
      const id = label ?? makeId(`${seq[1]}_n`, section)
      push(section, { t: 'seq', id, label: `${seq[1]}_n`, hidden: newHidden(), line: no, term, range })
      return
    }
    if (!new RegExp(`^${NAME}$`).test(lhs)) {
      // 좌변이 식 → 음함수
      buildImplicit(lhs, rhs, no, section, label)
      return
    }
    if (lhs === 'y') {
      const body = parseExpr(rhs)
      if (freeVars(body).has('y')) {
        buildImplicit(lhs, rhs, no, section, label)
        return
      }
      const evalAt = compileWith(rhs, ['x'], no)
      const id = label ?? makeId('y', section)
      push(section, {
        t: 'curve',
        id,
        label: label ? `${label}(x)` : 'y',
        source: rhs,
        hidden: newHidden(),
        line: no,
        evalAt,
        colorIndex: 0,
      })
      return
    }
    if (lhs === 'r') {
      // 극곡선 (스칼라 r은 pass 1에서 걸러짐 — 여기 오면 theta 포함)
      const pieces = topSplit(rhs, ',')
      const range: [number, number] =
        pieces.length === 2 ? parseRange(pieces[1], 'theta', no) : [0, 2 * Math.PI]
      if (pieces.length > 2) fail(no, `극곡선은 'r = 식[, theta in [a, b]]' 형태입니다`)
      const r = compileWith(pieces[0], ['theta'], no)
      push(section, {
        t: 'polar',
        id: label ?? makeId('polar', section),
        hidden: newHidden(),
        line: no,
        r,
        range,
        colorIndex: 0,
      })
      return
    }
    // 좌변이 다른 단일 이름 — 스칼라(wave A에서 처리)거나 잘못된 함수 정의
    if (scalarNames.has(lhs)) return
    fail(no, `'${lhs} = 식'을 해석할 수 없습니다 — 함수는 '${lhs}(x) = 식'으로 정의합니다`)
  }

  const buildImplicit = (lhs: string, rhs: string, no: number, section: number, label?: string) => {
    const F: Expr = { t: 'bin', op: '-', l: parseExpr(lhs), r: parseExpr(rhs) }
    const free = freeVars(F)
    if (!free.has('x') && !free.has('y'))
      fail(no, `방정식에 x 또는 y가 필요합니다 (음함수 곡선)`)
    for (const v of free) {
      if (v !== 'x' && v !== 'y' && !scalarSet.has(v) && !(v in CONSTANTS) && !reg.has(v))
        fail(no, `알 수 없는 식별자: '${v}' (param 또는 상수로 먼저 선언)`)
    }
    const fn = compileAst(F, new Set([...scalarSet, 'x', 'y']), reg)
    push(section, {
      t: 'implicit',
      id: label ?? makeId('C', section),
      source: `${lhs.trim()} = ${rhs.trim()}`,
      hidden: newHidden(),
      line: no,
      F: fn,
      colorIndex: 0,
    })
  }

  const buildRegion = (text: string, no: number, section: number, label?: string) => {
    const found = findTop(text, ['<=', '>=', '<', '>'])!
    const lhs = text.slice(0, found.idx)
    const rhs = text.slice(found.idx + found.tok.length)
    if (findTop(rhs, ['<=', '>=', '<', '>']))
      fail(no, `연쇄 부등식은 지원하지 않습니다 — 부등식 하나로 나눠 쓰세요`)
    // F > 0 이 채움 영역이 되도록 방향을 맞춘다
    const [gt, lt] = found.tok.startsWith('>') ? [lhs, rhs] : [rhs, lhs]
    const F: Expr = { t: 'bin', op: '-', l: parseExpr(gt), r: parseExpr(lt) }
    const fn = compileAst(F, new Set([...scalarSet, 'x', 'y']), reg)
    push(section, {
      t: 'region',
      id: label ?? makeId('R', section),
      hidden: newHidden(),
      line: no,
      F: fn,
    })
  }

  const buildParametric = (text: string, no: number, section: number, label?: string) => {
    const pieces = topSplit(text, ',')
    if (pieces.length !== 2)
      fail(no, `매개변수 곡선은 '(x식, y식), s in [시작, 끝]' 형태입니다`)
    const tuple = /^\((.*)\)$/.exec(pieces[0])
    if (!tuple) fail(no, `매개변수 곡선은 순서쌍 (x식, y식)으로 시작합니다`)
    const coords = topSplit(tuple![1], ',')
    if (coords.length !== 2) fail(no, `순서쌍은 (x식, y식) 두 성분이어야 합니다`)
    const range = parseRange(pieces[1], 's', no)
    const fx = compileWith(coords[0], ['s'], no)
    const fy = compileWith(coords[1], ['s'], no)
    push(section, {
      t: 'parametric',
      id: label ?? makeId('curve', section),
      hidden: newHidden(),
      line: no,
      fx,
      fy,
      range,
      colorIndex: 0,
    })
  }

  /* ── wave B2: 도구 문장 ── */

  const parseTuple = (arg: string, what: string, no: number): [EvalFn, EvalFn] => {
    const m = /^\((.*)\)$/.exec(arg)
    if (!m) fail(no, `${what}은(는) 순서쌍 (x식, y식)이어야 합니다`)
    const coords = topSplit(m![1], ',')
    if (coords.length !== 2) fail(no, `${what}은(는) (x식, y식) 두 성분이어야 합니다`)
    return [scalarExpr(coords[0], no), scalarExpr(coords[1], no)]
  }

  const parseBracket = (arg: string, what: string, no: number): [EvalFn, EvalFn] => {
    const m = /^\[(.*)\]$/.exec(arg)
    if (!m) fail(no, `${what}은(는) [시작, 끝] 형태입니다`)
    const parts = topSplit(m![1], ',')
    if (parts.length !== 2) fail(no, `${what}은(는) [시작, 끝] 두 값이어야 합니다`)
    return [scalarExpr(parts[0], no), scalarExpr(parts[1], no)]
  }

  const arity = (tool: string, args: string[], expected: string, ok: boolean, no: number) => {
    if (!ok) fail(no, `${tool}(${expected}) 형태로 씁니다 (인자 ${args.length}개 전달됨)`)
  }

  const buildTool = (tool: string, args: string[], no: number, section: number, label?: string) => {
    const hidden = newHidden()
    const base = { hidden, line: no }
    switch (tool) {
      case 'tangent': {
        arity(tool, args, '함수, 접점x', args.length === 2, no)
        const of = fnRef(args[0], no)
        push(section, {
          ...base,
          t: 'tangent',
          id: label ?? makeId('tangent', section),
          of,
          deriv: xEval(args[0], 1, no),
          at: scalarExpr(args[1], no),
        })
        return
      }
      case 'secant': {
        arity(tool, args, '함수, a, b', args.length === 3, no)
        push(section, {
          ...base,
          t: 'secant',
          id: label ?? makeId('secant', section),
          of: fnRef(args[0], no),
          a: scalarExpr(args[1], no),
          b: scalarExpr(args[2], no),
        })
        return
      }
      case 'integral': {
        arity(tool, args, '함수, [시작, 끝]', args.length === 2, no)
        const [a, b] = parseBracket(args[1], '적분 구간', no)
        push(section, {
          ...base,
          t: 'integral',
          id: label ?? makeId('integral', section),
          of: fnRef(args[0], no),
          a,
          b,
        })
        return
      }
      case 'riemann': {
        arity(tool, args, '함수, [시작, 끝], n[, 방식]', args.length === 3 || args.length === 4, no)
        const [a, b] = parseBracket(args[1], '구간', no)
        const method = args.length === 4 ? args[3] : 'mid'
        if (method !== 'left' && method !== 'right' && method !== 'mid')
          fail(no, `riemann 방식은 left·right·mid 중 하나입니다`)
        push(section, {
          ...base,
          t: 'riemann',
          id: label ?? makeId('riemann', section),
          of: fnRef(args[0], no),
          a,
          b,
          n: scalarExpr(args[2], no),
          method: method as 'left' | 'right' | 'mid',
        })
        return
      }
      case 'area': {
        arity(tool, args, '함수f, 함수g, [시작, 끝]', args.length === 3, no)
        const [a, b] = parseBracket(args[2], '구간', no)
        push(section, {
          ...base,
          t: 'area',
          id: label ?? makeId('area', section),
          of: fnRef(args[0], no),
          g: fnRef(args[1], no),
          a,
          b,
        })
        return
      }
      case 'intersect': {
        arity(tool, args, '대상A, 대상B', args.length === 2, no)
        // 대상이 뒤에 선언될 수 있으므로 해석은 finalize에서
        pendingIntersects.push({
          no,
          section,
          id: label ?? makeId('intersect', section),
          aName: args[0],
          bName: args[1],
        })
        return
      }
      case 'point': {
        arity(tool, args, '함수, x위치 | x식, y식', args.length === 2, no)
        const id = label ?? makeId('P', section)
        if (new RegExp(`^${NAME}$`).test(args[0]) && reg.has(args[0])) {
          push(section, {
            ...base,
            t: 'point',
            id,
            label: id,
            of: fnRef(args[0], no),
            at: scalarExpr(args[1], no),
          })
        } else {
          push(section, {
            ...base,
            t: 'point',
            id,
            label: id,
            px: scalarExpr(args[0], no),
            py: scalarExpr(args[1], no),
          })
        }
        return
      }
      case 'vector':
      case 'segment': {
        arity(tool, args, '(x1, y1), (x2, y2)', args.length === 2, no)
        const [x1, y1] = parseTuple(args[0], '시점', no)
        const [x2, y2] = parseTuple(args[1], '종점', no)
        push(section, { ...base, t: tool, id: label ?? makeId(tool, section), x1, y1, x2, y2 })
        return
      }
      case 'line': {
        arity(tool, args, '(x, y), 기울기', args.length === 2, no)
        const [px, py] = parseTuple(args[0], '지나는 점', no)
        push(section, {
          ...base,
          t: 'line',
          id: label ?? makeId('line', section),
          px,
          py,
          slope: scalarExpr(args[1], no),
        })
        return
      }
      case 'label': {
        arity(tool, args, '(x, y), "텍스트"', args.length === 2, no)
        const [px, py] = parseTuple(args[0], '위치', no)
        const m = /^"(.*)"$/.exec(args[1])
        if (!m) fail(no, `label 텍스트는 "큰따옴표"로 감쌉니다`)
        push(section, { ...base, t: 'label', id: label ?? makeId('label', section), px, py, text: m![1] })
        return
      }
      default:
        fail(no, `알 수 없는 도구: ${tool}`)
    }
  }

  /* ── 행 순회 (B1 → B2) ── */

  const TOOL_RE = new RegExp(`^(${NAME})\\s*\\((.*)\\)\\s*$`)

  interface Classified {
    kind: 'directive' | 'tool' | 'item' | 'decl-only'
    run?: () => void
  }

  const classify = (l: LineInfo, label?: string, text?: string): Classified => {
    const t = text ?? l.text
    const firstWord = /^[A-Za-z]+/.exec(t)?.[0] ?? ''

    if (!label && DIRECTIVES.has(firstWord)) {
      const rest = t.slice(firstWord.length).trim()
      return {
        kind: 'directive',
        run: () => {
          if (l.section < 0 && (firstWord === 'show' || firstWord === 'hide' || firstWord === 'style'))
            fail(l.no, `${firstWord}는 구역(---) 안에 씁니다`)
          switch (firstWord) {
            case 'view': {
              const v = parseView(rest, l.no)
              if (l.section < 0) defaultView = v
              else sections[l.section].view = v
              return
            }
            case 'animate':
              parseAnimate(rest, l.no)
              return
            case 'show':
            case 'hide': {
              const targets = rest.split(/\s+/).filter(Boolean)
              if (!targets.length) fail(l.no, `${firstWord} 대상이 없습니다`)
              for (const target of targets)
                pendingHides.push({ no: l.no, section: l.section, show: firstWord === 'show', target })
              return
            }
            case 'style':
              fail(l.no, `style 지시문은 예약되어 있습니다 (아직 지원되지 않음)`)
          }
        },
      }
    }

    // 라벨: 이름: 문장 (콜론이 = 뒤에 오는 param 표기와는 정규식 상 겹치지 않는다)
    if (!label) {
      const lm = new RegExp(`^(${NAME})\\s*:\\s*(.+)$`).exec(t)
      if (lm && labelNames.has(lm[1])) return classify(l, lm[1], lm[2])
    }

    const toolMatch = TOOL_RE.exec(t)
    if (toolMatch && TOOLS.has(toolMatch[1])) {
      const args = topSplit(toolMatch[2], ',')
      return {
        kind: 'tool',
        run: () => {
          if (l.section < 0) fail(l.no, `도구 문장은 구역(---) 안에 씁니다`)
          buildTool(toolMatch[1], args, l.no, l.section, label)
        },
      }
    }

    if (findTop(t, ['<=', '>=', '<', '>'])) {
      return {
        kind: 'item',
        run: () => {
          if (l.section < 0) fail(l.no, `부등식 영역은 구역(---) 안에 씁니다`)
          buildRegion(t, l.no, l.section, label)
        },
      }
    }

    const eq = findTop(t, ['='])
    if (eq) {
      const lhs = t.slice(0, eq.idx).trim()
      const rhs = t.slice(eq.idx + 1).trim()
      if (!rhs) return { kind: 'item', run: () => fail(l.no, `'='의 우변이 비어 있습니다`) }
      // 함수 정의 → 구역 안 + 인자 x면 곡선으로 표시 (그 외는 헬퍼)
      const fnDef = new RegExp(`^(${NAME})\\s*\\(\\s*(${NAME})\\s*\\)$`).exec(lhs)
      if (fnDef) {
        const [, name, formal] = fnDef
        if (formal !== 'x' || l.section < 0) return { kind: 'decl-only' }
        return {
          kind: 'item',
          run: () => {
            push(l.section, {
              t: 'curve',
              id: name,
              label: `${name}(x)`,
              source: rhs,
              hidden: newHidden(),
              line: l.no,
              evalAt: reg.evalOf(name, 0),
              colorIndex: 0,
            })
          },
        }
      }
      // 라벨된 y = … (pass 1에서 함수 등록됨) → 곡선 아이템
      if (label && lhs === 'y' && reg.has(label)) {
        return {
          kind: 'item',
          run: () => {
            if (l.section < 0) fail(l.no, `곡선은 구역(---) 안에 씁니다`)
            push(l.section, {
              t: 'curve',
              id: label,
              label: `${label}(x)`,
              hidden: newHidden(),
              line: l.no,
              evalAt: xEval(label, 0, l.no),
              colorIndex: 0,
            })
          },
        }
      }
      // 스칼라 선언은 wave A에서 처리 완료 (r은 우변에 theta가 없을 때만 스칼라)
      if (
        new RegExp(`^${NAME}$`).test(lhs) &&
        scalarNames.has(lhs) &&
        !(lhs === 'r' && /theta|θ/.test(rhs))
      )
        return { kind: 'decl-only' }
      return {
        kind: 'item',
        run: () => {
          if (l.section < 0) fail(l.no, `곡선·방정식은 구역(---) 안에 씁니다`)
          buildEquation(lhs, rhs, l.no, l.section, label)
        },
      }
    }

    const deriv = DERIV_RE.exec(t)
    if (deriv) {
      const [, name, primes] = deriv
      return {
        kind: 'item',
        run: () => {
          if (l.section < 0) fail(l.no, `도함수 곡선은 구역(---) 안에 씁니다`)
          if (!reg.has(name)) fail(l.no, `'${name}'은(는) 정의된 함수가 아닙니다`)
          const order = primes.length
          const suffix = "'".repeat(order)
          push(l.section, {
            t: 'curve',
            id: label ?? makeId(`${name}${suffix}`, l.section),
            label: `${name}${suffix}(x)`,
            hidden: newHidden(),
            line: l.no,
            evalAt: xEval(name, order, l.no),
            colorIndex: 0,
          })
        },
      }
    }

    if (t.startsWith('(')) {
      return {
        kind: 'item',
        run: () => {
          if (l.section < 0) fail(l.no, `매개변수 곡선은 구역(---) 안에 씁니다`)
          buildParametric(t, l.no, l.section, label)
        },
      }
    }

    return {
      kind: 'item',
      run: () =>
        fail(
          l.no,
          `해석할 수 없는 문장입니다: '${t}' — 곡선(f(x) = 식), param(a = 1 : [0, 2]), 도구(tangent(f, t) 등), 지시문(view·---)을 지원합니다`,
        ),
    }
  }

  const classified = lines.map((l) => ({ l, c: classify(l) }))
  for (const { l, c } of classified) {
    if (c.kind !== 'tool' && c.run) attempt(l.no, c.run)
  }
  for (const { l, c } of classified) {
    if (c.kind === 'tool' && c.run) attempt(l.no, c.run)
  }

  /* ── finalize ── */

  // intersect 해석 — 함수×함수 또는 함수×음함수
  for (const p of pendingIntersects) {
    attempt(p.no, () => {
      const items = sections[p.section].items
      const resolve = (name: string): { fn?: FnRef; F?: EvalFn } => {
        if (reg.has(name)) return { fn: fnRef(name, p.no) }
        const item = items.find((it) => it.id === name)
        if (item?.t === 'implicit') return { F: item.F }
        fail(p.no, `'${name}'은(는) 함수 또는 이 구역의 음함수 라벨이 아닙니다`)
        return {}
      }
      const a = resolve(p.aName)
      const b = resolve(p.bName)
      if (a.fn && b.fn) {
        push(p.section, {
          t: 'intersect',
          id: p.id,
          hidden: newHidden(),
          line: p.no,
          aName: p.aName,
          bName: p.bName,
          kind: 'ff',
          f: a.fn,
          g: b.fn,
        })
      } else if ((a.fn && b.F) || (a.F && b.fn)) {
        push(p.section, {
          t: 'intersect',
          id: p.id,
          hidden: newHidden(),
          line: p.no,
          aName: p.aName,
          bName: p.bName,
          kind: 'fi',
          f: (a.fn ?? b.fn)!,
          F: a.F ?? b.F,
        })
      } else {
        fail(p.no, `intersect는 함수×함수 또는 함수×음함수만 지원합니다`)
      }
    })
  }

  // 구역별 곡선 색 배정 — 선언(행) 순서
  for (const sec of sections) {
    sec.items.sort((a, b) => a.line - b.line)
    let color = 0
    for (const item of sec.items) {
      if (
        item.t === 'curve' ||
        item.t === 'implicit' ||
        item.t === 'polar' ||
        item.t === 'parametric'
      ) {
        item.colorIndex = color % 4
        color += 1
      }
    }
    if (!sec.view.x) sec.view = { ...defaultView, ...sec.view, x: sec.view.x ?? defaultView.x }
    if (!sec.view.y && defaultView.y) sec.view = { ...sec.view, y: defaultView.y }
    if (defaultView.equal) sec.view = { ...sec.view, equal: true }
  }

  // hide/show 적용 (행 순서)
  for (const p of pendingHides.sort((a, b) => a.no - b.no)) {
    attempt(p.no, () => {
      const sec = sections[p.section]
      if (p.target === 'hover') {
        sec.hoverHidden = !p.show
        return
      }
      const dot = p.target.indexOf('.')
      const id = dot < 0 ? p.target : p.target.slice(0, dot)
      const slot = dot < 0 ? '*' : p.target.slice(dot + 1)
      const item = sec.items.find((it) => it.id === id)
      if (!item)
        fail(p.no, `'${id}'은(는) 이 구역의 아이템이 아닙니다 (hover 또는 아이템 이름)`)
      if (slot !== '*' && !TYPE_SLOTS[item!.t].includes(slot))
        fail(p.no, `'${id}'의 표시 항목이 아닙니다: '${slot}' (${TYPE_SLOTS[item!.t].join('·')})`)
      const hidden = item!.hidden as Set<string>
      if (p.show) hidden.delete(slot)
      else hidden.add(slot)
    })
  }

  if (errors.length) throw new Error(errors.join('\n'))

  const total = sections.reduce((acc, s) => acc + s.items.length, 0)
  if (total === 0)
    throw new Error(`그릴 내용이 없습니다 — 곡선(예: f(x) = x^2) 문장을 추가하세요`)

  return { params, consts, animations, sections }
}
