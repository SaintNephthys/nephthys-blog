import type { PlotSpec } from '../../../lib/graph'
import CircleSubPlot from './CircleSubPlot'
import FnSubPlot from './FnSubPlot'

interface SubPlotProps {
  plot: PlotSpec
  values: Record<string, number>
  height: number
}

/**
 * kind → 렌더 컴포넌트 디스패치. 판별 유니언이라 새 kind를 유니언에 추가하고
 * 여기서 처리하지 않으면 타입 오류로 드러난다.
 * fn·circle은 경량이라 정적 import — 무거운 의존성(three.js 등)을 갖는 kind는
 * 반드시 React.lazy + Suspense로 등록해 기존 청크를 오염시키지 않는다
 * (계약: lib/graph/kinds/contract.ts).
 */
function SubPlot({ plot, values, height }: SubPlotProps) {
  return plot.kind === 'circle' ? (
    <CircleSubPlot plot={plot} values={values} height={height} />
  ) : (
    <FnSubPlot plot={plot} values={values} height={height} />
  )
}

export default SubPlot
