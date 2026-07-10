import { useState } from 'react'
import type { AnimateDef, ParamDef } from '../../../lib/scene'
import { fmt } from './fmt'

interface ParamValueInputProps {
  param: ParamDef
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
  params: ParamDef[]
  values: Record<string, number>
  onChange: (name: string, v: number) => void
  animations: AnimateDef[]
  /** 재생 중인 param 이름들 */
  playing: string[]
  onTogglePlay: (name: string) => void
}

/**
 * param 공유 슬라이더 + 값 직접 입력 — 모든 구역이 이 한 세트에 동기화된다.
 * animate 지시문이 있는 param에는 재생/정지 토글이 붙는다(기본 정지 — 저자가
 * 선언해도 독자가 켜기 전에는 CPU를 쓰지 않는다).
 */
function ParamControls({
  params,
  values,
  onChange,
  animations,
  playing,
  onTogglePlay,
}: ParamControlsProps) {
  if (params.length === 0) return null
  return (
    <div className="fngraph__params">
      {params.map((p) => {
        const animated = animations.some((a) => a.name === p.name)
        const isPlaying = playing.includes(p.name)
        return (
          <div className="fngraph__param" key={p.name}>
            <span className="fngraph__param-name">{p.name}</span>
            {animated && (
              <button
                type="button"
                className="fngraph__param-play"
                aria-pressed={isPlaying}
                aria-label={`${p.name} 애니메이션 ${isPlaying ? '정지' : '재생'}`}
                onClick={() => onTogglePlay(p.name)}
              >
                {isPlaying ? '■' : '▶'}
              </button>
            )}
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
        )
      })}
    </div>
  )
}

export default ParamControls
