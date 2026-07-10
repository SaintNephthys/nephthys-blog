import type { ReactNode } from 'react'
import Panel from '../widgets/Panel'

/**
 * 에디터 "그래프 가이드" 탭 — ```graph DSL 문법 레퍼런스(선언 문장·도구 문장·
 * 지시문·식 문법·이름 규칙)를 표로 제시한다. 정적 콘텐츠(로컬 dev 전용 —
 * EditorPage 청크에 포함되므로 프로덕션 번들에는 들어가지 않는다).
 *
 * ⚠ 이 표는 문법(src/lib/scene/)·devnotes §2와 **별도 소유**다 — 문법에 문장·
 * 도구·지시문을 추가하면 GraphComposer 팔레트와 함께 여기 표에도 반영할 것.
 */

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="graph-guide__table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const c = (s: string) => <code>{s}</code>

function GraphGuide() {
  return (
    <div className="graph-guide">
      <Panel title="선언 문장 — 줄 하나 = 문장 하나, 분류는 좌변 형태 + 자유변수">
        <Table
          head={['유형', '형태', '예', '비고']}
          rows={[
            ['함수 정의', c('이름(변수) = 식'), c('f(x) = x^3 - 3x'), '인자가 x일 때만 곡선으로 그려짐(그 외는 계산용 헬퍼). 이름으로 도구에서 참조'],
            ['도함수 곡선', c("이름'"), c("f'"), "정의한 함수의 기호 미분 곡선 (f''도 가능)"],
            ['익명 곡선', c('y = 식'), c('y = a*sin(x)'), '우변 변수는 x만'],
            ['음함수 곡선', c('식 = 식'), c('x^2 + y^2 = r^2'), '방정식에 x·y 포함 — 원·이차곡선·타원 곡선'],
            ['부등식 영역', c('식 ⋚ 식'), c('y <= x + k'), '참 영역을 음영으로. 연쇄 부등식 불가'],
            ['극곡선', c('r = 식'), c('r = 1 + cos(theta)'), <>우변에 theta 필요. {c(', theta in [a, b]')} 꼬리 선택(기본 [0, 2π])</>],
            ['매개변수 곡선', c('(식, 식), s in [a, b]'), c('(2cos(s), sin(s)), s in [0, 2pi]'), '순서쌍 + s 구간 필수'],
            ['수열', c('이름_n = 식, n in [a, b]'), c('a_n = 1/n, n in [1, 30]'), '정수 점열'],
            ['방향장', c("y' = 식"), c("y' = x - y"), '기울기장 (x·y의 식)'],
            ['param 슬라이더', c('이름 = 상수 : [min, max, step?]'), c('t = 1 : [0, 10, 0.1]'), 'step 생략 시 (max−min)/100. 선언 순서 = 표시 순서'],
            ['상수', c('이름 = 상수 식'), c('k = 2*pi'), 'param 참조 불가 · 사용 전에 선언'],
            ['라벨', c('이름: 문장'), c('C: x^2 + y^2 = r^2'), '아이템에 참조 이름 부여 — 도구·hide 대상'],
            ['주석', c('# …'), c('# 극값 확인용'), '문자열 밖의 # 이후 무시'],
          ]}
        />
      </Panel>

      <Panel title="도구 문장 — 인자의 식은 param·상수만 (x 불가), 슬라이더 연동">
        <Table
          head={['도구', '시그니처', '표시 내용']}
          rows={[
            [c('tangent'), c('tangent(f, 접점x)'), '접선 + 접점 링 + 기울기 readout'],
            [c('secant'), c('secant(f, a, b)'), '할선 + 두 점 + 기울기 readout'],
            [c('integral'), c('integral(f, [a, b])'), '음영·경계선 + ∫ 수치(심프슨)'],
            [c('riemann'), c('riemann(f, [a, b], n, left|mid|right?)'), '막대 + Σ 수치 (기본 mid, n 1~400)'],
            [c('area'), c('area(f, g, [a, b])'), '곡선 사이 음영 + ∫|f−g| 수치'],
            [c('intersect'), c('intersect(A, B)'), '교점 마커 + 좌표. 함수×함수/함수×음함수(라벨 참조)만'],
            [c('point'), c('point(f, x위치) / point(x식, y식)'), '링 마커 + 좌표 readout'],
            [c('vector'), c('vector((x1, y1), (x2, y2))'), '화살표'],
            [c('segment'), c('segment((x1, y1), (x2, y2))'), '점선 선분'],
            [c('line'), c('line((x, y), 기울기)'), '점선 직선(표시 범위 전체) — 점근선 용도'],
            [c('label'), c('label((x, y), "텍스트")'), '텍스트 주석'],
          ]}
        />
      </Panel>

      <Panel title="지시문">
        <Table
          head={['지시문', '형태', '의미']}
          rows={[
            [c('view'), c('view x[a, b] y[c, d] equal?'), '좌표계. 생략 시 x [-10, 10]·y 자동. equal = 종횡비 등화(원이 원으로)'],
            [c('---'), c('--- 제목?'), '구역 분할(1~4개 — 2개 2×1, 3~4개 2×2). 첫 --- 이전은 공통 영역: param·상수·헬퍼·view·animate만'],
            [c('animate'), c('animate 이름: a -> b, 초s?, loop|once?'), 'param 자동 재생(기본 4s·loop). ▶/■ 토글 — 기본 정지'],
            [c('hide / show'), c('hide 아이템[.슬롯] / hide hover'), '표시 끄기/켜기. 슬롯 예: f.hover, integral.value, riemann.bars'],
            [c('style'), '—', '예약됨 (아직 미지원)'],
          ]}
        />
        <p className="graph-guide__note">
          선언한 것의 자연스러운 표시가 <strong>기본 on</strong> — hide로 미세 조정한다.
        </p>
      </Panel>

      <Panel title="식 문법">
        <Table
          head={['요소', '내용']}
          rows={[
            ['연산자', <>{c('+ - * / ^')}(우결합, {c('-x^2 = -(x^2)')}), 괄호. 비교({c('< <= > >=')})는 if 조건 자리 전용</>],
            ['곱셈 생략', <>숫자·괄호 뒤만: {c('2x')}, {c('3sin(x)')}, {c('(x+1)(x-1)')}. 식별자끼리는 {c('*')} 필수({c('a*b')})</>],
            ['상수', c('pi  e  tau')],
            ['1인자 함수', c('sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs sign exp ln log log10 log2 floor ceil round fact')],
            ['2인자 함수', c('min max pow atan2 nCr')],
            ['조건', <>{c('if(조건, 참값, 거짓값)')} — 예: {c('if(x < 0, -x, x)')}</>],
            ['합', <>{c('sum(k, a, b, 식)')} — 예: {c('sum(k, 0, n, x^k / fact(k))')}</>],
            ['미분', <>{c("f'(x)")} — 정의한 함수의 기호 미분 (차수 중첩 가능)</>],
            ['유니코드 별칭', <>{c('θ→theta  π→pi  τ→tau  ·×→*  ≤≥→<= >=')} — 수용만, 정규형은 ASCII</>],
          ]}
        />
      </Panel>

      <Panel title="이름 규칙">
        <Table
          head={['항목', '규칙']}
          rows={[
            ['전면 예약(사용 금지)', <>{c('x y theta')} + 상수·내장 함수·도구명·지시문 키워드·{c('if sum in')}</>],
            ['param·상수로만 허용', <>{c('r n s')} — 수열·매개변수·극곡선 문장 안에서는 그 문장의 변수가 param을 가린다(섀도잉)</>],
            ['사용자 이름', <>영문자로 시작({c('[A-Za-z][A-Za-z0-9]*')}). 함수·param·상수·라벨이 한 이름 공간 — 중복 선언 오류</>],
            ['선언 순서', '무관(2-pass) — 단, 상수는 사용 전에 선언. param은 전 구역 공유'],
            ['재귀', <>{c('f(x) = f(x) + 1')} 같은 순환 정의 금지(검사됨)</>],
          ]}
        />
        <p className="graph-guide__note">
          판별 불능·미선언 식별자는 행 번호를 짚는 오류로 표시된다 — 프리뷰의 오류
          패널에서 여러 행이 한 번에 보고된다.
        </p>
      </Panel>
    </div>
  )
}

export default GraphGuide
