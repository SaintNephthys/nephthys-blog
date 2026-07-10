/**
 * 마칭 스퀘어 — 음함수 곡선 F(x,y)=0의 등고선과 부등식 영역 F>0의 채움 다각형.
 * 자체 구현(외부 의존성 없음): 격자 셀마다 모서리 부호로 교차점을 선형 보간한다.
 *
 * - 등고선: 셀 변의 부호 변화 지점을 이어 선분 목록으로 (렌더는 M/L path — 인접
 *   셀이 끝점을 공유하므로 stroke는 연속으로 보인다)
 * - 채움: 셀 경계를 시계 방향으로 걸으며 F>0 꼭짓점과 교차점만 남기는 다각형
 *   클리핑 — 16케이스 테이블 없이 전 케이스를 일관 처리한다
 */

export interface MarchResult {
  /** 등고선 선분 [x1, y1, x2, y2] 목록 (데이터 좌표) */
  segments: Array<[number, number, number, number]>
  /** F>0 영역의 셀 다각형 목록 (데이터 좌표 꼭짓점) */
  polygons: Array<Array<[number, number]>>
}

export function marchingSquares(
  F: (x: number, y: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  nx: number,
  ny: number,
  wantFill: boolean,
): MarchResult {
  const vals = new Float64Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j += 1) {
    const y = y0 + ((y1 - y0) * j) / ny
    for (let i = 0; i <= nx; i += 1) {
      const x = x0 + ((x1 - x0) * i) / nx
      const v = F(x, y)
      vals[j * (nx + 1) + i] = Number.isFinite(v) ? v : NaN
    }
  }

  const segments: MarchResult['segments'] = []
  const polygons: MarchResult['polygons'] = []
  const gx = (i: number) => x0 + ((x1 - x0) * i) / nx
  const gy = (j: number) => y0 + ((y1 - y0) * j) / ny

  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      // 셀 모서리 시계 방향: (i,j) → (i+1,j) → (i+1,j+1) → (i,j+1)
      const corners: Array<[number, number, number]> = [
        [gx(i), gy(j), vals[j * (nx + 1) + i]],
        [gx(i + 1), gy(j), vals[j * (nx + 1) + i + 1]],
        [gx(i + 1), gy(j + 1), vals[(j + 1) * (nx + 1) + i + 1]],
        [gx(i), gy(j + 1), vals[(j + 1) * (nx + 1) + i]],
      ]
      if (corners.some((c) => Number.isNaN(c[2]))) continue

      const crossings: Array<[number, number]> = []
      const poly: Array<[number, number]> = []
      for (let k = 0; k < 4; k += 1) {
        const [ax, ay, av] = corners[k]
        const [bx, by, bv] = corners[(k + 1) % 4]
        if (av > 0) poly.push([ax, ay])
        if ((av > 0) !== (bv > 0)) {
          const t = av / (av - bv) // av + t(bv-av) = 0 지점 선형 보간
          const cx = ax + t * (bx - ax)
          const cy = ay + t * (by - ay)
          crossings.push([cx, cy])
          poly.push([cx, cy])
        }
      }
      if (crossings.length === 2) {
        segments.push([crossings[0][0], crossings[0][1], crossings[1][0], crossings[1][1]])
      } else if (crossings.length === 4) {
        // 안장(saddle) — 셀 중앙값 부호로 짝을 정한다
        const cx = (gx(i) + gx(i + 1)) / 2
        const cy = (gy(j) + gy(j + 1)) / 2
        const center = F(cx, cy)
        const firstPositive = corners[0][2] > 0
        const pairFirst = (center > 0) === firstPositive
        if (pairFirst) {
          segments.push([crossings[0][0], crossings[0][1], crossings[3][0], crossings[3][1]])
          segments.push([crossings[1][0], crossings[1][1], crossings[2][0], crossings[2][1]])
        } else {
          segments.push([crossings[0][0], crossings[0][1], crossings[1][0], crossings[1][1]])
          segments.push([crossings[2][0], crossings[2][1], crossings[3][0], crossings[3][1]])
        }
      }
      if (wantFill && poly.length >= 3) polygons.push(poly)
    }
  }
  return { segments, polygons }
}
