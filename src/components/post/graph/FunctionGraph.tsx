import { useEffect, useMemo, useRef, useState } from 'react'
import { parseGraphSource, type SceneSection } from '../../../lib/scene'
import { PLOT_HEIGHT, SUB_PLOT_HEIGHT } from './constants'
import ParamControls from './ParamControls'
import SectionPlot from './SectionPlot'

/**
 * ```graph 코드 펜스가 렌더되는 인터랙티브 그래프의 컨테이너.
 * DSL 파싱(Scene IR)·공유 param 상태·animate 재생 루프·구역 배치·오류 격리를
 * 담당하고, 그리기는 SectionPlot, param UI는 ParamControls가 소유한다.
 *
 * 구역(---) 1~4개가 작성 순서대로 배치된다(2개: 2×1, 3~4개: 2×2 — 3개면 넷째
 * 칸은 빈 칸). 모든 구역은 param 슬라이더 한 세트에 동기화된다.
 */

interface FunctionGraphProps {
  /** 코드 펜스 본문(DSL 텍스트) */
  spec: string
}

function sectionTitle(section: SceneSection): string {
  if (section.title) return section.title
  for (const item of section.items) {
    if (item.t === 'curve' && item.source) {
      const lhs = item.label === 'y' ? 'y' : item.label
      return `${lhs} = ${item.source}`
    }
    if (item.t === 'implicit' && item.source) return item.source
  }
  return 'GRAPH'
}

function FunctionGraph({ spec }: FunctionGraphProps) {
  // 스펙(param 정의)이 바뀌면 저장된 슬라이더 값·재생 상태를 무시하도록 키를 함께
  // 저장 (stale 상태 필터링 패턴 — 에디터 프리뷰에서 스펙 수정 시 대응)
  const [paramState, setParamState] = useState<{
    key: string
    values: Record<string, number>
  }>({ key: '', values: {} })
  const [playState, setPlayState] = useState<{ key: string; names: string[] }>({
    key: '',
    names: [],
  })
  const startRef = useRef(new Map<string, number>())

  const parsed = useMemo(() => {
    try {
      return { scene: parseGraphSource(spec), error: '' }
    } catch (e) {
      return { scene: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [spec])
  const scene = parsed.scene

  const paramKey = useMemo(() => (scene ? JSON.stringify(scene.params) : ''), [scene])
  const values = useMemo(() => {
    const overrides = paramState.key === paramKey ? paramState.values : {}
    const v: Record<string, number> = { ...(scene?.consts ?? {}) }
    scene?.params.forEach((p) => {
      v[p.name] = overrides[p.name] ?? p.def
    })
    return v
  }, [scene, paramKey, paramState])

  const playing = useMemo(
    () => (playState.key === paramKey ? playState.names : []),
    [playState, paramKey],
  )

  // animate 재생 루프 — 재생 중인 param만 rAF로 갱신한다
  useEffect(() => {
    if (!scene || playing.length === 0) return
    let raf = 0
    const tick = (now: number) => {
      const updates: Record<string, number> = {}
      const done: string[] = []
      for (const name of playing) {
        const anim = scene.animations.find((a) => a.name === name)
        const p = scene.params.find((pp) => pp.name === name)
        if (!anim || !p) continue
        if (!startRef.current.has(name)) startRef.current.set(name, now)
        const frac = (now - startRef.current.get(name)!) / (anim.duration * 1000)
        const t = anim.loop ? frac % 1 : Math.min(1, frac)
        updates[name] = Math.min(p.max, Math.max(p.min, anim.from + (anim.to - anim.from) * t))
        if (!anim.loop && frac >= 1) done.push(name)
      }
      setParamState((prev) => ({
        key: paramKey,
        values: { ...(prev.key === paramKey ? prev.values : {}), ...updates },
      }))
      if (done.length)
        setPlayState((prev) => ({
          key: paramKey,
          names: prev.names.filter((n) => !done.includes(n)),
        }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, paramKey, playing])

  if (!scene) {
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

  const togglePlay = (name: string) => {
    startRef.current.delete(name) // 재생을 다시 시작하면 from부터
    setPlayState((prev) => {
      const names = prev.key === paramKey ? prev.names : []
      return {
        key: paramKey,
        names: names.includes(name) ? names.filter((n) => n !== name) : [...names, name],
      }
    })
  }

  const multi = scene.sections.length > 1

  return (
    <div className="fngraph">
      {!multi && <div className="fngraph__title">{sectionTitle(scene.sections[0])}</div>}
      <div
        className={
          multi ? 'fngraph__plot-wrap fngraph__plot-wrap--grid' : 'fngraph__plot-wrap'
        }
      >
        {multi ? (
          // 작성 순서 배치: 2개 → 2×1, 3~4개 → 2×2 (3개면 넷째 칸은 grid가 빈 칸으로 남긴다)
          scene.sections.map((sec, i) => (
            <div className="fngraph__cell" key={i}>
              <div className="fngraph__title fngraph__title--sub">{sectionTitle(sec)}</div>
              <SectionPlot section={sec} values={values} height={SUB_PLOT_HEIGHT} />
            </div>
          ))
        ) : (
          <SectionPlot section={scene.sections[0]} values={values} height={PLOT_HEIGHT} />
        )}
      </div>
      <ParamControls
        params={scene.params}
        values={values}
        onChange={setValue}
        animations={scene.animations}
        playing={playing}
        onTogglePlay={togglePlay}
      />
    </div>
  )
}

export default FunctionGraph
