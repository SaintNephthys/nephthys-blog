import { useMemo, useState } from 'react'
import { parseGraphSpec, type PlotSpec } from '../../../lib/graph'
import { PLOT_HEIGHT, SUB_PLOT_HEIGHT } from './constants'
import ParamControls from './ParamControls'
import SubPlot from './SubPlot'

/**
 * ```graph 코드 펜스가 렌더되는 인터랙티브 함수 그래프의 컨테이너.
 * 파싱·공유 param 상태·배치·오류 격리를 담당하고, 그리기는 SubPlot(kind 디스패치),
 * param UI는 ParamControls가 소유한다. D3는 수학만, SVG 렌더는 React가 한다.
 *
 * 다중 서브플롯: [[plot]] 1~4개가 작성 순서대로 배치된다(2개: 2×1, 3~4개: 2×2 —
 * 3개면 넷째 칸은 빈 칸). 모든 서브플롯은 [params] 슬라이더 한 세트에 동기화된다.
 */

interface FunctionGraphProps {
  /** 코드 펜스 본문(스펙 텍스트) */
  spec: string
}

function FunctionGraph({ spec: specText }: FunctionGraphProps) {
  // 스펙(param 정의)이 바뀌면 저장된 슬라이더 값을 무시하도록 키를 함께 저장
  // (CLAUDE.md의 stale 상태 필터링 패턴 — 에디터 프리뷰에서 스펙 수정 시 대응)
  const [paramState, setParamState] = useState<{
    key: string
    values: Record<string, number>
  }>({ key: '', values: {} })

  const parsed = useMemo(() => {
    try {
      return { spec: parseGraphSpec(specText), error: '' }
    } catch (e) {
      return { spec: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [specText])
  const spec = parsed.spec

  const paramKey = useMemo(
    () => (spec ? JSON.stringify(spec.params) : ''),
    [spec],
  )
  const values = useMemo(() => {
    const overrides = paramState.key === paramKey ? paramState.values : {}
    const v: Record<string, number> = {}
    spec?.params.forEach((p) => {
      v[p.name] = overrides[p.name] ?? p.def
    })
    return v
  }, [spec, paramKey, paramState])

  if (!spec) {
    return (
      <div className="fngraph fngraph--error">
        <div className="fngraph__title">GRAPH — 스펙 오류</div>
        <div className="fngraph__error-msg">{parsed.error}</div>
      </div>
    )
  }

  const setValue = (name: string, v: number) =>
    setParamState((prev) => ({
      key: paramKey,
      values: { ...(prev.key === paramKey ? prev.values : {}), [name]: v },
    }))

  const titleOf = (p: PlotSpec) =>
    p.title ?? (p.kind === 'circle' ? '단위원' : `f(x) = ${p.fnSource}`)
  const multi = spec.plots.length > 1

  return (
    <div className="fngraph">
      {!multi && <div className="fngraph__title">{titleOf(spec.plots[0])}</div>}
      <div
        className={
          multi ? 'fngraph__plot-wrap fngraph__plot-wrap--grid' : 'fngraph__plot-wrap'
        }
      >
        {multi ? (
          // 작성 순서 배치: 2개 → 2×1, 3~4개 → 2×2 (3개면 넷째 칸은 grid가 빈 칸으로 남긴다)
          spec.plots.map((p, i) => (
            <div className="fngraph__cell" key={i}>
              <div className="fngraph__title fngraph__title--sub">{titleOf(p)}</div>
              <SubPlot plot={p} values={values} height={SUB_PLOT_HEIGHT} />
            </div>
          ))
        ) : (
          <SubPlot plot={spec.plots[0]} values={values} height={PLOT_HEIGHT} />
        )}
      </div>
      <ParamControls params={spec.params} values={values} onChange={setValue} />
    </div>
  )
}

export default FunctionGraph
