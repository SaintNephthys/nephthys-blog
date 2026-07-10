/**
 * 식 엔진 배럴 — 외부(scene·컴포넌트)는 여기서만 import 한다.
 * 모든 kind·아이템·구현이 공유하는 단일 원천(포크 금지 — 문법 계약).
 */

export { calledNames, freeVars, type Expr } from './ast'
export { CONSTANTS, isReservedWord } from './builtins'
export { compileAst, FnRegistry, type EvalFn, type UserFnDef } from './compile'
export { normalizeAliases, parseExpr } from './parse'
