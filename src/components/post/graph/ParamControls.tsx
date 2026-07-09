import { useState } from 'react'
import type { GraphParam } from '../../../lib/graph'
import { fmt } from './fmt'

interface ParamValueInputProps {
  param: GraphParam
  value: number
  onCommit: (v: number) => void
}

/**
 * 파라미터 값 직접 입력 박스 — Enter/blur로 확정.
 * draft가 null이면 비편집 상태로, 슬라이더로 바뀌는 외부 값을 그대로 표시한다.
 * 범위 밖·비숫자 입력은 입력 전 값으로 되돌리고 하단에 허용 범위 안내를 띄운다
 * (안내는 다시 타이핑하거나 유효한 값을 확정하면 사라진다).
 */
function ParamValueInput({ param, value, onCommit }: ParamValueInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    if (draft === null) return
    const n = Number(draft.trim())
    const ok =
      draft.trim() !== '' && Number.isFinite(n) && n >= param.min && n <= param.max
    if (ok) onCommit(n)
    setDraft(null) // 유효하면 확정값이, 아니면 입력 전 값이 표시된다
    setInvalid(!ok)
  }

  return (
    <span className="fngraph__param-value-box">
      <input
        type="text"
        inputMode="decimal"
        className="fngraph__param-value"
        aria-label={`${param.name} 값 직접 입력`}
        aria-invalid={invalid}
        value={draft ?? fmt(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value)
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(null)
            setInvalid(false)
          }
        }}
      />
      {invalid && (
        <span className="fngraph__param-error">
          {`${fmt(param.min)} ~ ${fmt(param.max)} 사이의 숫자를 입력하세요`}
        </span>
      )}
    </span>
  )
}

interface ParamControlsProps {
  params: GraphParam[]
  values: Record<string, number>
  onChange: (name: string, v: number) => void
}

/** [params] 공유 슬라이더 + 값 직접 입력 — 모든 서브플롯이 이 한 세트에 동기화된다 */
function ParamControls({ params, values, onChange }: ParamControlsProps) {
  if (params.length === 0) return null
  return (
    <div className="fngraph__params">
      {params.map((p) => (
        <div className="fngraph__param" key={p.name}>
          <span className="fngraph__param-name">{p.name}</span>
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={values[p.name]}
            onChange={(e) => onChange(p.name, Number(e.target.value))}
          />
          <ParamValueInput
            param={p}
            value={values[p.name]}
            onCommit={(v) => onChange(p.name, v)}
          />
        </div>
      ))}
    </div>
  )
}

export default ParamControls
