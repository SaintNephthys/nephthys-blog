/**
 * kind 모듈 계약 — "현재 아키텍처"의 내부 인터페이스.
 * 저자가 보는 공개 API는 이 인터페이스가 아니라 **문법 계약(devnotes §2.5)**이다 —
 * 차후 어떤 kind가 전혀 다른 구현(워커·WebGL 등)으로 제공되더라도 문법은 동일해야 한다.
 *
 * 구현 규칙:
 * - parse()는 항상 저비용·동기 — 에디터 프리뷰에서 키 입력마다 재실행된다.
 *   무거운 계산(레이트레이싱 등)은 렌더 컴포넌트가 소유하며, 이 계약은 compute의
 *   동기성을 가정하지 않는다.
 * - 렌더 컴포넌트가 무거운 의존성(three.js 등)을 갖는 kind는 SubPlot 디스패처에
 *   React.lazy로 등록한다 — 기존 청크를 오염시키지 않는다.
 * - 새 kind는 설정을 전부 [[plot]] 안에 둔다 — 최상위 키는 동결(문법 계약).
 * - kind 이름은 소문자 식별자, 게시물에 배포되는 순간 영구(개명 불가).
 */

export interface ParseContext {
  paramNames: string[]
  /** 최상위 domain/range — fn 계열 kind의 공통 기본값 (다른 kind는 무시) */
  defaults: { domain?: [number, number]; range?: [number, number] }
  /** 오류 메시지용 — "plot 1" 또는 "fn"(단일 모드) */
  label: string
}

export interface PlotKindModule<Spec> {
  readonly kind: string
  /** 이 kind가 받는 plot 키 — index.ts가 전체 합집합으로 미지 키를 시끄럽게 거부 */
  readonly plotKeys: readonly string[]
  parse(v: Record<string, unknown>, ctx: ParseContext): Spec
}
