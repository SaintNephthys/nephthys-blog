import { useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * GRAPH 버튼으로 열리는 그래프 삽입 창 — |분류|문장 팔레트|미리보기| 3열.
 * DSL(수학 문장) 개정에 맞춰 속성 조합 폼이 아니라 **문장 템플릿 팔레트**다:
 * 항목을 클릭하면 미리보기 버퍼에 문장이 추가되고, 버퍼는 직접 편집할 수 있다.
 * 적용 시 ```graph 펜스로 감싸 커서 위치에 삽입한다.
 *
 * 자기 일관 원칙(구 카탈로그에서 계승): 항목 하나만 넣어도 파싱 가능한 문장이
 * 되도록, f나 param을 참조하는 템플릿은 버퍼에 해당 선언이 없으면 함께 추가한다.
 *
 * ⚠ 이 카탈로그는 문법(src/lib/scene/)과 **별도 소유**다 — 새 문장 형태·도구를
 * 문법에 추가하면 반드시 여기 팔레트에도 반영할 것 (devnotes 절차 참조).
 */

interface StmtDef {
  key: string
  name: string
  desc: string
  lines: string[]
  /** 버퍼에 f(x) 정의가 없으면 이 줄을 먼저 추가 */
  needsFn?: string
  /** 버퍼에 이 param 선언이 없으면 함께 추가 — [이름, 선언 줄] */
  needsParam?: [string, string]
}

interface GroupDef {
  key: string
  name: string
  items: StmtDef[]
}

const GROUPS: GroupDef[] = [
  {
    key: 'curve',
    name: '곡선·방정식',
    items: [
      { key: 'fn', name: '함수 곡선', desc: 'f(x) = 식 — 이름으로 도구에서 참조 가능', lines: ['f(x) = x^2'] },
      { key: 'anon', name: '익명 곡선', desc: 'y = 식 (이름 없이 그리기만)', lines: ['y = sin(x)'] },
      {
        key: 'deriv',
        name: '도함수 곡선',
        desc: "f' — 정의한 함수의 기호 미분 곡선",
        lines: ["f'"],
        needsFn: 'f(x) = x^3 - 3x',
      },
      { key: 'implicit', name: '음함수 곡선', desc: '방정식 (x·y 포함) — 원·이차곡선', lines: ['x^2 + y^2 = 4'] },
      { key: 'region', name: '부등식 영역', desc: '부등식의 참 영역을 음영으로', lines: ['y <= x'] },
      { key: 'polar', name: '극곡선', desc: 'r = theta의 식', lines: ['r = 1 + cos(theta)'] },
      {
        key: 'parametric',
        name: '매개변수 곡선',
        desc: '(x식, y식), s in [구간]',
        lines: ['(2cos(s), sin(s)), s in [0, 2pi]'],
      },
      { key: 'seq', name: '수열', desc: '이름_n = 식, n in [구간] — 정수 점열', lines: ['a_n = 1/n, n in [1, 30]'] },
      { key: 'field', name: '방향장', desc: "y' = x·y의 식 — 기울기장", lines: ["y' = x - y"] },
    ],
  },
  {
    key: 'tool',
    name: '도구',
    items: [
      {
        key: 'tangent',
        name: '접선',
        desc: 'tangent(f, 접점x) — 기울기 readout 포함',
        lines: ['tangent(f, t)'],
        needsFn: 'f(x) = x^3 - 3x',
        needsParam: ['t', 't = 1 : [-2.5, 2.5]'],
      },
      {
        key: 'secant',
        name: '할선',
        desc: 'secant(f, a, b) — 평균변화율',
        lines: ['secant(f, 1, 1 + h)'],
        needsFn: 'f(x) = x^2',
        needsParam: ['h', 'h = 1 : [0.01, 2, 0.01]'],
      },
      {
        key: 'integral',
        name: '정적분',
        desc: 'integral(f, [a, b]) — 음영 + ∫ 값',
        lines: ['integral(f, [0, t])'],
        needsFn: 'f(x) = x^2',
        needsParam: ['t', 't = 1 : [0, 2]'],
      },
      {
        key: 'riemann',
        name: '리만합',
        desc: 'riemann(f, [a, b], n, left|mid|right)',
        lines: ['riemann(f, [0, 2], n, mid)'],
        needsFn: 'f(x) = x^2',
        needsParam: ['n', 'n = 4 : [1, 100, 1]'],
      },
      {
        key: 'area',
        name: '곡선 사이 넓이',
        desc: 'area(f, g, [a, b])',
        lines: ['g(x) = x', 'area(f, g, [0, 1])'],
        needsFn: 'f(x) = x^2',
      },
      {
        key: 'intersect',
        name: '교점',
        desc: 'intersect(A, B) — 함수×함수/음함수',
        lines: ['C: x^2 + y^2 = 4', 'l: y = x', 'intersect(C, l)'],
      },
      {
        key: 'point',
        name: '추적점',
        desc: 'point(f, x위치) 또는 point(x식, y식)',
        lines: ['point(f, t)'],
        needsFn: 'f(x) = sin(x)',
        needsParam: ['t', 't = 1 : [0, 6.28]'],
      },
      { key: 'vector', name: '벡터', desc: 'vector(시점, 종점) — 화살표', lines: ['vector((0, 0), (2, 1))'] },
      { key: 'segment', name: '선분', desc: 'segment(점, 점) — 점선 보조선', lines: ['segment((0, 0), (2, 1))'] },
      { key: 'line', name: '직선', desc: 'line((x, y), 기울기) — 점근선 등', lines: ['line((0, 1), 0)'] },
      { key: 'label', name: '텍스트', desc: 'label((x, y), "메모")', lines: ['label((1, 1), "메모")'] },
    ],
  },
  {
    key: 'ctrl',
    name: 'param·지시문',
    items: [
      { key: 'param', name: 'param 슬라이더', desc: '이름 = 기본값 : [최소, 최대, 스텝?]', lines: ['t = 1 : [0, 10, 0.1]'] },
      { key: 'const', name: '상수', desc: '이름 = 숫자 식 (슬라이더 없음)', lines: ['k = 2'] },
      { key: 'view', name: '좌표계', desc: 'view x[a, b] y[c, d] — 생략 시 자동', lines: ['view x[-10, 10] y[-5, 5]'] },
      { key: 'equal', name: '종횡비 등화', desc: 'view … equal — 원이 원으로 보이게', lines: ['view x[-4, 4] y[-4, 4] equal'] },
      {
        key: 'animate',
        name: '애니메이션',
        desc: 'animate 이름: 시작 -> 끝, 초s, loop|once',
        lines: ['animate t: 0 -> 10, 6s, loop'],
        needsParam: ['t', 't = 0 : [0, 10]'],
      },
      { key: 'hide', name: '표시 끄기', desc: 'hide 아이템[.슬롯] / hide hover', lines: ['# hide f.hover  ← 주석을 풀어 사용'] },
      { key: 'section', name: '구역 분할', desc: '--- 제목 (1~4개, 2×1/2×2 배치)', lines: ['--- 제목'] },
    ],
  },
  {
    key: 'preset',
    name: '프리셋',
    items: [
      {
        key: 'p-tangent',
        name: '접선과 도함수',
        desc: '미분 수업 데모 — f·f′·접선',
        lines: ['f(x) = x^3 - 3x', "f'", 'tangent(f, t)', 'view x[-3, 3] y[-5, 5]', 't = 1 : [-2.5, 2.5]'],
      },
      {
        key: 'p-riemann',
        name: '리만합 → 정적분',
        desc: 'n을 키우면 ∫ 값에 수렴',
        lines: [
          'f(x) = x^2',
          'riemann(f, [0, 2], n, mid)',
          'integral(f, [0, 2])',
          'hide integral.area',
          'view x[-0.5, 2.5] y[-0.5, 4.5]',
          'n = 4 : [1, 100, 1]',
        ],
      },
      {
        key: 'p-circle',
        name: '원과 직선의 위치 관계',
        desc: '음함수 원 + 직선 + 교점',
        lines: [
          'view x[-4, 4] y[-4, 4] equal',
          'C: x^2 + y^2 = r^2',
          'l: y = x + k',
          'intersect(C, l)',
          'r = 2 : [0.5, 3]',
          'k = 1 : [-4, 4]',
        ],
      },
      {
        key: 'p-unit',
        name: '단위원과 sin·cos',
        desc: '3구역 동기화 + 애니메이션',
        lines: [
          't = 45 : [0, 360, 1]',
          'animate t: 0 -> 360, 8s, loop',
          '--- 단위원 (θ = t°)',
          'view x[-1.3, 1.3] y[-1.3, 1.3] equal',
          'C: x^2 + y^2 = 1',
          'vector((0, 0), (cos(t*pi/180), sin(t*pi/180)))',
          'segment((cos(t*pi/180), sin(t*pi/180)), (cos(t*pi/180), 0))',
          'segment((cos(t*pi/180), sin(t*pi/180)), (0, sin(t*pi/180)))',
          '--- sin(x°)',
          'view x[0, 360] y[-1.2, 1.2]',
          'f(x) = sin(x*pi/180)',
          'point(f, t)',
          '--- cos(x°)',
          'view x[0, 360] y[-1.2, 1.2]',
          'g(x) = cos(x*pi/180)',
          'point(g, t)',
        ],
      },
      {
        key: 'p-field',
        name: '방향장과 해곡선',
        desc: 'ODE 데모 — 기울기장 위 해',
        lines: ["y' = x - y", 'f(x) = x - 1 + c*exp(-x)', 'view x[-4, 4] y[-4, 4]', 'c = 1 : [-3, 3]'],
      },
      {
        key: 'p-taylor',
        name: '테일러 부분합',
        desc: 'sum()으로 sin의 급수 근사',
        lines: [
          'f(x) = sin(x)',
          'g(x) = sum(k, 0, n, (-1)^k * x^(2k+1) / fact(2k+1))',
          'view x[-2pi, 2pi] y[-2, 2]',
          'n = 1 : [0, 8, 1]',
        ],
      },
    ],
  },
]

interface GraphComposerProps {
  onInsert: (text: string) => void
  onClose: () => void
}

function GraphComposer({ onInsert, onClose }: GraphComposerProps) {
  const [groupKey, setGroupKey] = useState(GROUPS[0].key)
  const [buffer, setBuffer] = useState('')
  const [alertOpen, setAlertOpen] = useState(false)

  const group = GROUPS.find((g) => g.key === groupKey) ?? GROUPS[0]

  const addStmt = (item: StmtDef) => {
    setBuffer((prev) => {
      const pre: string[] = []
      // 자기 일관: 참조하는 선언이 버퍼에 없으면 함께 추가
      if (item.needsFn && !/^f\s*\(\s*x\s*\)\s*=/m.test(prev)) pre.push(item.needsFn)
      if (item.needsParam && !new RegExp(`^${item.needsParam[0]}\\s*=`, 'm').test(prev))
        pre.push(item.needsParam[1])
      const added = [...pre, ...item.lines].join('\n')
      return prev ? `${prev}\n${added}` : added
    })
  }

  const apply = () => {
    if (!buffer.trim()) {
      setAlertOpen(true)
      return
    }
    onInsert('\n```graph\n' + buffer.trim() + '\n```\n')
    onClose()
  }

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
            <h4>분류</h4>
            {GROUPS.map((g) => (
              <button
                type="button"
                key={g.key}
                className={
                  groupKey === g.key ? 'graphdlg__item graphdlg__item--on' : 'graphdlg__item'
                }
                onClick={() => setGroupKey(g.key)}
              >
                <strong>{g.name}</strong>
                <span>{g.items.length}개 항목</span>
              </button>
            ))}
          </section>
          <section className="graphdlg__col">
            <h4>문장 팔레트 — 클릭해서 추가</h4>
            {group.items.map((item) => (
              <button
                type="button"
                key={item.key}
                className="graphdlg__item"
                onClick={() => addStmt(item)}
              >
                <strong>{item.name}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </section>
          <section className="graphdlg__col">
            <h4>미리보기 — 직접 편집 가능</h4>
            <textarea
              className="graphdlg__preview"
              value={buffer}
              placeholder="팔레트에서 문장을 고르거나 직접 입력하세요"
              onChange={(e) => setBuffer(e.target.value)}
              spellCheck={false}
            />
            {buffer && (
              <button type="button" className="btn graphdlg__clear" onClick={() => setBuffer('')}>
                비우기
              </button>
            )}
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
              <p>삽입할 문장을 먼저 추가해 주세요.</p>
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
