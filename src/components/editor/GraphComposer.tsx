import { useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * GRAPH 버튼으로 열리는 그래프 삽입 창 — |작성 가능 그래프|적용 가능 속성|속성 값|
 * 3열(각 열 스크롤). 선택·적용 내용으로 ```graph boilerplate를 만들어 커서에 삽입한다.
 *
 * 카탈로그의 기본값은 **자기 일관**이 원칙 — 어떤 적용 조합이라도 값을 비워두면
 * 파싱 가능한 스펙이 생성된다(예: integral 기본 [0, 1] — 미선언 param 참조 금지).
 * 의존 관계가 있는 속성(display.graph.point → point 등)은 적용 시 자동 동반 적용.
 *
 * ⚠ 이 카탈로그는 스펙(src/lib/graph/)과 **별도 소유**다 — kind·plot 키·display
 * 항목을 스펙에 추가하면 반드시 여기 KindDef/PropDef에도 반영할 것
 * (절차: devnotes §5-5. 타입 강제가 없어 빠뜨려도 컴파일은 통과한다).
 */

interface FieldDef {
  key: string
  label: string
  /** 빈 값일 때 적용되는 기본값 (placeholder로도 노출) */
  def: string
  bool?: boolean
}

interface PropDef {
  key: string
  name: string
  desc: string
  required?: boolean
  hint?: string
  /** 적용 시 함께 적용되는 선행 속성 */
  requires?: string[]
  fields: FieldDef[]
  emit: (v: (fieldKey: string) => string) => string[]
}

interface KindDef {
  key: string
  name: string
  desc: string
  props: PropDef[]
  assemble: (blocks: Array<{ key: string; lines: string[] }>) => string[]
}

/** 적분 경계 — 숫자는 그대로, 식은 따옴표로 */
const bound = (s: string) =>
  s !== '' && Number.isFinite(Number(s)) ? s : `"${s}"`

const PARAM_FIELDS = (
  name: string,
  def: string,
  min: string,
  max: string,
  step: string,
): FieldDef[] => [
  { key: 'name', label: '이름', def: name },
  { key: 'def', label: '기본값', def },
  { key: 'min', label: '최소', def: min },
  { key: 'max', label: '최대', def: max },
  { key: 'step', label: '스텝', def: step },
]

const emitParam = (v: (k: string) => string) => [
  `${v('name')} = { default = ${v('def')}, min = ${v('min')}, max = ${v('max')}, step = ${v('step')} }`,
]

const boolField: FieldDef[] = [{ key: 'on', label: '표시', def: 'true', bool: true }]

const FN_KIND: KindDef = {
  key: 'fn',
  name: '함수 그래프',
  desc: 'y = f(x) 곡선 (kind = "fn")',
  props: [
    {
      key: 'fn',
      name: 'fn',
      desc: '함수 식 (필수)',
      required: true,
      fields: [{ key: 'expr', label: '식 f(x)', def: 'x^2' }],
      emit: (v) => [`fn = "${v('expr')}"`],
    },
    {
      key: 'domain',
      name: 'domain',
      desc: 'x 정의역',
      fields: [
        { key: 'min', label: '최소', def: '-10' },
        { key: 'max', label: '최대', def: '10' },
      ],
      emit: (v) => [`domain = [${v('min')}, ${v('max')}]`],
    },
    {
      key: 'range',
      name: 'range',
      desc: 'y 표시 범위 (점근선 함수 권장)',
      fields: [
        { key: 'min', label: '최소', def: '-2' },
        { key: 'max', label: '최대', def: '2' },
      ],
      emit: (v) => [`range = [${v('min')}, ${v('max')}]`],
    },
    {
      key: 'params',
      name: 'params',
      desc: '슬라이더 파라미터',
      fields: PARAM_FIELDS('t', '1', '0', '10', '0.1'),
      emit: emitParam,
    },
    {
      key: 'integral',
      name: 'integral',
      desc: '적분 구간',
      hint: '경계에 param 식(예: t)을 쓰려면 params도 적용하세요',
      fields: [
        { key: 'from', label: '시작', def: '0' },
        { key: 'to', label: '끝', def: '1' },
      ],
      emit: (v) => [`integral = [${bound(v('from'))}, ${bound(v('to'))}]`],
    },
    {
      key: 'point',
      name: 'point',
      desc: '추적점의 x 위치 식',
      hint: 'param 식(예: t)을 쓰려면 params도 적용하세요',
      fields: [{ key: 'expr', label: '식', def: '1' }],
      emit: (v) => [`point = "${v('expr')}"`],
    },
    {
      key: 'display.x',
      name: 'display.x',
      desc: 'x readout + 호버 크로스헤어',
      fields: boolField,
      emit: (v) => [`display.x = ${v('on')}`],
    },
    {
      key: 'display.fx',
      name: 'display.fx',
      desc: 'f(x) readout + 호버 점',
      fields: boolField,
      emit: (v) => [`display.fx = ${v('on')}`],
    },
    {
      key: 'display.integral',
      name: 'display.integral',
      desc: '∫ 값 readout',
      requires: ['integral'],
      fields: boolField,
      emit: (v) => [`display.integral = ${v('on')}`],
    },
    {
      key: 'display.graph.integral',
      name: 'display.graph.integral',
      desc: '적분 음영·경계선 시각화',
      requires: ['integral'],
      fields: boolField,
      emit: (v) => [`display.graph.integral = ${v('on')}`],
    },
    {
      key: 'display.graph.point',
      name: 'display.graph.point',
      desc: 'param 추적점 마커',
      requires: ['point'],
      fields: boolField,
      emit: (v) => [`display.graph.point = ${v('on')}`],
    },
  ],
  // 단일 모드: 최상위 키들 → 마지막에 [params] 섹션 (dotted key가 테이블 헤더보다 앞)
  assemble: (blocks) => {
    const params = blocks.find((b) => b.key === 'params')
    const body = blocks.filter((b) => b.key !== 'params').flatMap((b) => b.lines)
    return params ? [...body, '', '[params]', ...params.lines] : body
  },
}

const CIRCLE_KIND: KindDef = {
  key: 'circle',
  name: '단위원',
  desc: '단위원 + 회전 반지름 (kind = "circle")',
  props: [
    {
      key: 'angle',
      name: 'angle',
      desc: '반지름 각도 식, 라디안 (필수)',
      required: true,
      fields: [{ key: 'expr', label: '식', def: 't * pi / 180' }],
      emit: (v) => [`angle = "${v('expr')}"`],
    },
    {
      key: 'params',
      name: 'params',
      desc: '각도 param (필수)',
      required: true,
      fields: PARAM_FIELDS('t', '45', '0', '360', '1'),
      emit: emitParam,
    },
    {
      key: 'display.theta',
      name: 'display.theta',
      desc: '반지름·끝점 + θ readout (기본 기능)',
      required: true,
      fields: boolField,
      emit: (v) => [`display.theta = ${v('on')}`],
    },
    {
      key: 'title',
      name: 'title',
      desc: '구역 타이틀',
      fields: [{ key: 'text', label: '제목', def: '단위원' }],
      emit: (v) => [`title = "${v('text')}"`],
    },
    {
      key: 'display.cos',
      name: 'display.cos',
      desc: 'cos readout + x축 사영',
      fields: boolField,
      emit: (v) => [`display.cos = ${v('on')}`],
    },
    {
      key: 'display.sin',
      name: 'display.sin',
      desc: 'sin readout + y축 사영',
      fields: boolField,
      emit: (v) => [`display.sin = ${v('on')}`],
    },
  ],
  // circle은 [[plot]] 형태 — [params]가 앞, plot 테이블이 뒤
  assemble: (blocks) => {
    const params = blocks.find((b) => b.key === 'params')
    const plotLines = blocks.filter((b) => b.key !== 'params').flatMap((b) => b.lines)
    return [
      ...(params ? ['[params]', ...params.lines, ''] : []),
      '[[plot]]',
      'kind = "circle"',
      ...plotLines,
    ]
  },
}

const KIND_DEFS: KindDef[] = [FN_KIND, CIRCLE_KIND]

interface GraphComposerProps {
  onInsert: (text: string) => void
  onClose: () => void
}

function GraphComposer({ onInsert, onClose }: GraphComposerProps) {
  const [kindKey, setKindKey] = useState<string | null>(null)
  const [applied, setApplied] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [alertOpen, setAlertOpen] = useState(false)

  const kind = KIND_DEFS.find((k) => k.key === kindKey) ?? null

  const selectKind = (k: KindDef) => {
    setKindKey(k.key)
    setApplied(k.props.filter((p) => p.required).map((p) => p.key))
    setValues({})
  }

  const toggleProp = (p: PropDef) => {
    if (p.required) return
    setApplied((prev) =>
      prev.includes(p.key)
        ? prev.filter((key) => key !== p.key)
        : [...prev, p.key, ...(p.requires ?? []).filter((r) => !prev.includes(r))],
    )
  }

  const setFieldValue = (propKey: string, fieldKey: string, v: string) =>
    setValues((prev) => ({
      ...prev,
      [propKey]: { ...prev[propKey], [fieldKey]: v },
    }))

  const apply = () => {
    if (!kind) {
      setAlertOpen(true)
      return
    }
    const blocks = kind.props
      .filter((p) => applied.includes(p.key))
      .map((p) => ({
        key: p.key,
        // 값 미기입 → 필드 기본값(자기 일관 보장)
        lines: p.emit((fieldKey) => {
          const raw = values[p.key]?.[fieldKey]?.trim()
          return raw || (p.fields.find((f) => f.key === fieldKey)?.def ?? '')
        }),
      }))
    onInsert('\n```graph\n' + kind.assemble(blocks).join('\n') + '\n```\n')
    onClose()
  }

  const appliedProps = kind ? kind.props.filter((p) => applied.includes(p.key)) : []

  // portal로 body에 렌더 — .app-content(z-index: 1) 스태킹 컨텍스트 안에 갇히면
  // z-index 40이어도 .side-bar(z-index: 10) 뒤로 숨는다
  return createPortal(
    <div className="graphdlg-backdrop" onClick={onClose}>
      <div
        className="graphdlg"
        role="dialog"
        aria-label="그래프 삽입"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="graphdlg__title">
          GRAPH 삽입
          <button type="button" className="graphdlg__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="graphdlg__cols">
          <section className="graphdlg__col">
            <h4>작성 가능 그래프</h4>
            {KIND_DEFS.map((k) => (
              <button
                type="button"
                key={k.key}
                className={
                  kindKey === k.key ? 'graphdlg__item graphdlg__item--on' : 'graphdlg__item'
                }
                onClick={() => selectKind(k)}
              >
                <strong>{k.name}</strong>
                <span>{k.desc}</span>
              </button>
            ))}
          </section>
          <section className="graphdlg__col">
            <h4>적용 가능 속성</h4>
            {!kind && <p className="graphdlg__empty">그래프를 먼저 선택하세요</p>}
            {kind?.props.map((p) => (
              <button
                type="button"
                key={p.key}
                className={
                  applied.includes(p.key)
                    ? 'graphdlg__item graphdlg__item--on'
                    : 'graphdlg__item'
                }
                onClick={() => toggleProp(p)}
                aria-pressed={applied.includes(p.key)}
              >
                <strong>
                  {applied.includes(p.key) ? '▣' : '□'} {p.name}
                  {p.required && <em className="graphdlg__badge">필수</em>}
                </strong>
                <span>{p.desc}</span>
              </button>
            ))}
          </section>
          <section className="graphdlg__col">
            <h4>속성 값</h4>
            {appliedProps.length === 0 && (
              <p className="graphdlg__empty">
                {kind ? '적용한 속성이 없습니다 — 기본 boilerplate가 삽입됩니다' : ''}
              </p>
            )}
            {appliedProps.map((p) => (
              <fieldset className="graphdlg__fieldset" key={p.key}>
                <legend>{p.name}</legend>
                {p.fields.map((f) => (
                  <label className="graphdlg__field" key={f.key}>
                    <span>{f.label}</span>
                    {f.bool ? (
                      <select
                        value={values[p.key]?.[f.key] ?? f.def}
                        onChange={(e) => setFieldValue(p.key, f.key, e.target.value)}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder={f.def}
                        value={values[p.key]?.[f.key] ?? ''}
                        onChange={(e) => setFieldValue(p.key, f.key, e.target.value)}
                      />
                    )}
                  </label>
                ))}
                {p.hint && <p className="graphdlg__hint">{p.hint}</p>}
              </fieldset>
            ))}
          </section>
        </div>
        <div className="graphdlg__footer">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn" onClick={apply}>
            적용
          </button>
        </div>
        {alertOpen && (
          <div className="graphdlg__alert-backdrop">
            <div className="graphdlg__alert" role="alertdialog">
              <p>작성할 그래프를 먼저 선택해 주세요.</p>
              <button type="button" className="btn" onClick={() => setAlertOpen(false)}>
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default GraphComposer
