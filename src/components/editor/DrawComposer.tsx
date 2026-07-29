import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ROLES, roleDef, type RoleKey } from '../../lib/draw/palette'
import { findBindTarget, reflowBindings } from '../../lib/draw/bind'
import {
  addShape,
  alignShapes,
  bringToFront,
  distributeShapes,
  duplicateShapes,
  newShapeId,
  normalizeBox,
  removeShape,
  sendToBack,
  shapeBBox,
  translateShape,
  updateShape,
  type AlignMode,
} from '../../lib/draw/ops'
import { docToSvg, svgToDoc } from '../../lib/draw/svg'
import { emptyDoc, type DrawDoc, type LineShape, type Shape } from '../../lib/draw/types'

/**
 * '도형' 버튼으로 열리는 SVG 이미지 작성 모달 — excalidraw식 클릭-드래그 캔버스.
 * NieR 테마 다이어그램 팔레트(lib/draw/palette) 기반 도형을 그려 SVG로 저장하고
 * 게시물 커서 위치에 ![](파일.svg)로 삽입한다.
 *
 * 구조 원칙: 이 컴포넌트는 표면(UI)일 뿐, 문서 모델·직렬화·기하 연산은 전부
 * lib/draw의 순수 계층에 있다 — 차후 MCP/Agent가 같은 DrawDoc JSON을 생성·수정해
 * 동일한 docToSvg 경로로 저장하는 것을 전제한 분리다.
 *
 * 편의 기능: 격자 스냅(Alt 해제)·Shift 제약(정사각/정원·45° 선)·다중 선택
 * (Shift+클릭, 러버밴드)·정렬/분배·z순서·복제(Ctrl+D, Alt+드래그)·방향키 이동·
 * 다중 줄 라벨·기존 SVG 불러오기(메타데이터 왕복)·화살표-도형 바인딩.
 */

type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'

const DRAFT_KEY = 'nephthys-draw-doc'
const MIN_DRAW = 6 // 이보다 작은 드래그는 실수로 보고 버린다 (논리 px)
const HANDLE = 7
const GRID = 24

/** 저장·불러오기 위임 — EditorPage가 slug 맥락을 알고 구현한다 */
export interface DrawingApi {
  /** SVG 업로드(+신규면 본문 삽입). 성공 시 true. overwrite면 같은 이름을 덮어쓴다 */
  save(svgText: string, baseName: string, overwrite: boolean): Promise<boolean>
  /** 게시물의 svg 이미지 파일명 목록 */
  list(): Promise<string[]>
  /** svg 원문 로드 — 없으면 null */
  load(name: string): Promise<string | null>
}

interface DraftPayload {
  doc: DrawDoc
  savedAt: string
  fileName?: string
  loadedFrom?: string | null
}

function loadDraft(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftPayload>
    // 임베드 검증 로직 재사용을 위해 SVG 왕복으로 문서를 검증한다
    if (typeof parsed.savedAt !== 'string' || typeof parsed.doc !== 'object' || !parsed.doc)
      return null
    const doc = svgToDoc(docToSvg(parsed.doc, { fit: false }))
    return doc
      ? {
          doc,
          savedAt: parsed.savedAt,
          fileName: typeof parsed.fileName === 'string' ? parsed.fileName : undefined,
          loadedFrom: typeof parsed.loadedFrom === 'string' ? parsed.loadedFrom : null,
        }
      : null
  } catch {
    return null
  }
}

const snapTo = (v: number, enabled: boolean) => (enabled ? Math.round(v / GRID) * GRID : v)

/** 45° 배수로 각도 고정한 끝점 */
function constrainAngle(x1: number, y1: number, x2: number, y2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  const len = Math.hypot(x2 - x1, y2 - y1)
  return { x: x1 + Math.cos(snapped) * len, y: y1 + Math.sin(snapped) * len }
}

type Gesture =
  | { type: 'draw'; id: string; startX: number; startY: number; before: DrawDoc }
  | {
      type: 'move'
      ids: string[]
      primary: Shape
      startX: number
      startY: number
      origins: Map<string, Shape>
      moved: boolean
      before: DrawDoc
    }
  | {
      type: 'handle'
      id: string
      handle: string
      origin: Shape
      before: DrawDoc
    }
  | { type: 'marquee'; startX: number; startY: number; base: Set<string> }

interface DrawComposerProps {
  api: DrawingApi
  /** 지정 시 이 svg를 열어 편집 (본문 '도형 EDIT' 칩 진입 — localStorage 임시본 무시) */
  initialFile?: string | null
  onClose: () => void
}

function DrawComposer({ api, initialFile, onClose }: DrawComposerProps) {
  const draft = useMemo(() => (initialFile ? null : loadDraft()), [initialFile])
  const [doc, setDoc] = useState<DrawDoc>(() => draft?.doc ?? emptyDoc())
  const [tool, setTool] = useState<Tool>('rect')
  const [role, setRole] = useState<RoleKey>('alert')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [dashed, setDashed] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [fileName, setFileName] = useState(draft?.fileName ?? 'drawing')
  const [loadedFrom, setLoadedFrom] = useState<string | null>(draft?.loadedFrom ?? null)
  const [fileList, setFileList] = useState<string[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null)
  const [busy, setBusy] = useState(false)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [bindHint, setBindHint] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const docRef = useRef(doc)
  const gestureRef = useRef<Gesture | null>(null)
  const histRef = useRef<{ past: DrawDoc[]; future: DrawDoc[] }>({ past: [], future: [] })
  // pointer capture가 이후 mouse 이벤트(dblclick)를 svg 루트로 재타게팅하므로
  // 캡처 전인 pointerdown 시점의 히트 도형을 기억해 둔다
  const lastHitRef = useRef<string | null>(null)
  const apiRef = useRef(api)
  useEffect(() => {
    apiRef.current = api
  })

  /** 모든 문서 갱신의 단일 통로 — 바인딩 재계산 불변식을 여기서 유지한다 */
  const applyDoc = (next: DrawDoc) => {
    const flowed = reflowBindings(next)
    docRef.current = flowed
    setDoc(flowed)
  }

  /** 되돌리기 지점과 함께 문서를 갱신 */
  const commit = (next: DrawDoc) => {
    histRef.current.past.push(docRef.current)
    histRef.current.future = []
    applyDoc(next)
  }

  const pushHistory = (before: DrawDoc) => {
    histRef.current.past.push(before)
    histRef.current.future = []
  }

  const undo = () => {
    const h = histRef.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push(docRef.current)
    docRef.current = prev
    setDoc(prev)
    setSelectedIds(new Set())
  }

  const redo = () => {
    const h = histRef.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(docRef.current)
    docRef.current = next
    setDoc(next)
    setSelectedIds(new Set())
  }

  // 게시물의 기존 svg 목록 (불러오기 드롭다운)
  useEffect(() => {
    let cancelled = false
    apiRef.current
      .list()
      .then((files) => {
        if (!cancelled) setFileList(files.filter((f) => f.toLowerCase().endsWith('.svg')))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // 임시 저장: 변경 500ms 후 자동 (명시적 버튼과 같은 저장소)
  useEffect(() => {
    if (doc.shapes.length === 0 && histRef.current.past.length === 0) return
    const timer = window.setTimeout(() => {
      const savedAtNow = new Date().toISOString()
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ doc, savedAt: savedAtNow, fileName, loadedFrom }),
      )
      setSavedAt(savedAtNow)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [doc, fileName, loadedFrom])

  const saveDraftNow = () => {
    const savedAtNow = new Date().toISOString()
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc, savedAt: savedAtNow, fileName, loadedFrom }))
    setSavedAt(savedAtNow)
  }

  const selection = doc.shapes.filter((s) => selectedIds.has(s.id))
  const single = selection.length === 1 ? selection[0] : undefined

  /** 클라이언트 좌표 → 캔버스 논리 좌표 */
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * doc.width,
      y: ((e.clientY - r.top) / r.height) * doc.height,
    }
  }

  const findShapeId = (target: EventTarget | null): string | null =>
    target instanceof Element ? (target.closest('[data-id]')?.getAttribute('data-id') ?? null) : null

  const startEditing = (shape: Shape) => {
    if (shape.kind === 'line') return
    setSelectedIds(new Set([shape.id]))
    setEditing({ id: shape.id, value: shape.text ?? '' })
  }

  const commitEditing = () => {
    if (!editing) return
    const shape = docRef.current.shapes.find((s) => s.id === editing.id)
    setEditing(null)
    if (!shape) return
    const text = editing.value.replace(/\s+$/, '')
    if (shape.kind === 'text') {
      // 빈 텍스트는 도형 제거 (생성 직후 취소 포함)
      commit(
        text
          ? updateShape(docRef.current, shape.id, { text })
          : removeShape(docRef.current, shape.id),
      )
      if (!text) setSelectedIds(new Set())
    } else if (shape.kind !== 'line' && (shape.text ?? '') !== text) {
      commit(updateShape(docRef.current, shape.id, { text: text || undefined }))
    }
  }

  /** 이동 시작 스냅샷 — 함께 이동하지 않는 대상에 붙은 바인딩은 떼어낸다 */
  const beginMove = (ids: string[], primaryId: string, pt: { x: number; y: number }) => {
    const before = docRef.current
    const moving = new Set(ids)
    let next = before
    for (const s of before.shapes) {
      if (s.kind !== 'line' || !moving.has(s.id)) continue
      const patch: Partial<LineShape> = {}
      if (s.boundStart && !moving.has(s.boundStart)) patch.boundStart = undefined
      if (s.boundEnd && !moving.has(s.boundEnd)) patch.boundEnd = undefined
      if (Object.keys(patch).length > 0) next = updateShape(next, s.id, patch)
    }
    if (next !== before) applyDoc(next)
    const current = docRef.current
    const origins = new Map(current.shapes.filter((s) => moving.has(s.id)).map((s) => [s.id, s]))
    const primary = origins.get(primaryId)
    if (!primary) return
    gestureRef.current = {
      type: 'move',
      ids,
      primary,
      startX: pt.x,
      startY: pt.y,
      origins,
      moved: false,
      before,
    }
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || editing) return
    const raw = toCanvas(e)
    const before = docRef.current
    lastHitRef.current = findShapeId(e.target)
    const capture = () => e.currentTarget.setPointerCapture(e.pointerId)

    // 선택 도형의 리사이즈/끝점 핸들
    const handleName = e.target instanceof Element ? e.target.getAttribute('data-handle') : null
    if (handleName && single) {
      let origin = single
      // 끝점 핸들 드래그 중에는 해당 끝점 바인딩을 풀어 포인터를 따르게 한다
      if (single.kind === 'line') {
        const patch: Partial<LineShape> =
          handleName === 'p1' ? { boundStart: undefined } : { boundEnd: undefined }
        applyDoc(updateShape(before, single.id, patch))
        origin = docRef.current.shapes.find((s) => s.id === single.id) ?? single
      }
      gestureRef.current = { type: 'handle', id: single.id, handle: handleName, origin, before }
      capture()
      return
    }

    if (tool === 'select') {
      const id = lastHitRef.current
      if (!id) {
        // 빈 곳 — 러버밴드 선택 시작 (Shift는 기존 선택에 추가)
        const base = e.shiftKey ? new Set(selectedIds) : new Set<string>()
        if (!e.shiftKey) setSelectedIds(new Set())
        gestureRef.current = { type: 'marquee', startX: raw.x, startY: raw.y, base }
        capture()
        return
      }
      if (e.shiftKey) {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
        return
      }
      if (e.altKey) {
        // Alt+드래그 복제 — 히트 도형이 선택에 없으면 그 도형만 복제
        const targets = selectedIds.has(id) ? [...selectedIds] : [id]
        const { doc: cloned, newIds } = duplicateShapes(before, new Set(targets), 0, 0)
        applyDoc(cloned)
        setSelectedIds(new Set(newIds))
        beginMove(newIds, newIds[targets.indexOf(id)] ?? newIds[0], raw)
        if (gestureRef.current?.type === 'move') gestureRef.current.before = before
        capture()
        return
      }
      const ids = selectedIds.has(id) ? [...selectedIds] : [id]
      if (!selectedIds.has(id)) setSelectedIds(new Set([id]))
      beginMove(ids, id, raw)
      capture()
      return
    }

    const pt = { x: snapTo(raw.x, !e.altKey), y: snapTo(raw.y, !e.altKey) }

    if (tool === 'text') {
      const id = newShapeId(before)
      const shape: Shape = {
        kind: 'text',
        id,
        role,
        strokeWidth,
        dashed: false,
        x: pt.x,
        y: pt.y,
        text: '',
        size: 16,
      }
      commit(addShape(before, shape))
      setTool('select')
      startEditing(shape)
      return
    }

    // rect · ellipse · line · arrow — 드래그로 크기를 결정
    const id = newShapeId(before)
    const base = { id, role, strokeWidth, dashed }
    const shape: Shape =
      tool === 'rect' || tool === 'ellipse'
        ? { ...base, kind: tool, x: pt.x, y: pt.y, w: 0, h: 0 }
        : { ...base, kind: 'line', x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, arrow: tool === 'arrow' }
    gestureRef.current = { type: 'draw', id, startX: pt.x, startY: pt.y, before }
    applyDoc(addShape(before, shape))
    setSelectedIds(new Set())
    capture()
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gestureRef.current
    if (!g) return
    const raw = toCanvas(e)
    const current = docRef.current
    const snapOn = !e.altKey

    if (g.type === 'draw') {
      const shape = current.shapes.find((s) => s.id === g.id)
      if (!shape) return
      let pt = { x: snapTo(raw.x, snapOn), y: snapTo(raw.y, snapOn) }
      if (shape.kind === 'line') {
        if (e.shiftKey) pt = constrainAngle(g.startX, g.startY, pt.x, pt.y)
        applyDoc(updateShape(current, g.id, { x2: pt.x, y2: pt.y }))
        setBindHint(findBindTarget(current, pt.x, pt.y, g.id))
      } else if (shape.kind === 'rect' || shape.kind === 'ellipse') {
        let dx = pt.x - g.startX
        let dy = pt.y - g.startY
        if (e.shiftKey) {
          const m = Math.max(Math.abs(dx), Math.abs(dy))
          dx = (Math.sign(dx) || 1) * m
          dy = (Math.sign(dy) || 1) * m
        }
        applyDoc(updateShape(current, g.id, normalizeBox(g.startX, g.startY, dx, dy)))
      }
      return
    }

    if (g.type === 'move') {
      const pb = shapeBBox(g.primary)
      const dx = snapTo(pb.x + (raw.x - g.startX), snapOn) - pb.x
      const dy = snapTo(pb.y + (raw.y - g.startY), snapOn) - pb.y
      if (!g.moved && dx === 0 && dy === 0) return
      g.moved = true
      applyDoc({
        ...current,
        shapes: current.shapes.map((s) => {
          const origin = g.origins.get(s.id)
          return origin ? translateShape(origin, dx, dy) : s
        }),
      })
      return
    }

    if (g.type === 'marquee') {
      const box = normalizeBox(g.startX, g.startY, raw.x - g.startX, raw.y - g.startY)
      setMarquee(box)
      const picked = new Set(g.base)
      for (const s of current.shapes) {
        const b = shapeBBox(s)
        if (b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y)
          picked.add(s.id)
      }
      setSelectedIds(picked)
      return
    }

    // handle — 시작 시점 도형 기준으로 재계산 (누적 오차 없음)
    const { origin, handle } = g
    const pt = { x: snapTo(raw.x, snapOn), y: snapTo(raw.y, snapOn) }
    if (origin.kind === 'line') {
      let p = pt
      if (e.shiftKey) {
        const ox = handle === 'p1' ? origin.x2 : origin.x1
        const oy = handle === 'p1' ? origin.y2 : origin.y1
        p = constrainAngle(ox, oy, pt.x, pt.y)
      }
      applyDoc(
        updateShape(current, g.id, handle === 'p1' ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y }),
      )
      setBindHint(findBindTarget(current, p.x, p.y, g.id))
      return
    }
    if (origin.kind === 'rect' || origin.kind === 'ellipse') {
      const anchorX = handle.includes('w') ? origin.x + origin.w : origin.x
      const anchorY = handle.includes('n') ? origin.y + origin.h : origin.y
      let dx = pt.x - anchorX
      let dy = pt.y - anchorY
      if (e.shiftKey) {
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        dx = (Math.sign(dx) || 1) * m
        dy = (Math.sign(dy) || 1) * m
      }
      const box = normalizeBox(anchorX, anchorY, dx, dy)
      applyDoc(
        updateShape(current, g.id, {
          x: box.x,
          y: box.y,
          w: Math.max(box.w, MIN_DRAW),
          h: Math.max(box.h, MIN_DRAW),
        }),
      )
    }
  }

  const onPointerUp = () => {
    const g = gestureRef.current
    gestureRef.current = null
    setBindHint(null)
    if (!g) return
    const current = docRef.current

    if (g.type === 'draw') {
      const shape = current.shapes.find((s) => s.id === g.id)
      if (!shape) return
      const b = shapeBBox(shape)
      if (Math.max(b.w, b.h) < MIN_DRAW) {
        docRef.current = g.before // 실수 클릭 — 생성 취소
        setDoc(g.before)
        return
      }
      // 선/화살표 끝점이 도형 위에서 끝나면 바인딩
      if (shape.kind === 'line') {
        applyDoc(
          updateShape(current, g.id, {
            boundStart: findBindTarget(current, shape.x1, shape.y1, g.id) ?? undefined,
            boundEnd: findBindTarget(current, shape.x2, shape.y2, g.id) ?? undefined,
          }),
        )
      }
      pushHistory(g.before)
      setSelectedIds(new Set([g.id]))
      setTool('select')
      return
    }

    if (g.type === 'marquee') {
      setMarquee(null)
      return
    }

    if (g.type === 'move') {
      if (g.moved) pushHistory(g.before)
      return
    }

    // handle 종료 — 선 끝점이면 드롭 지점 기준으로 재바인딩
    const shape = current.shapes.find((s) => s.id === g.id)
    if (shape && shape.kind === 'line') {
      const isStart = g.handle === 'p1'
      const px = isStart ? shape.x1 : shape.x2
      const py = isStart ? shape.y1 : shape.y2
      const target = findBindTarget(current, px, py, g.id) ?? undefined
      applyDoc(updateShape(current, g.id, isStart ? { boundStart: target } : { boundEnd: target }))
    }
    pushHistory(g.before)
  }

  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const id = findShapeId(e.target) ?? lastHitRef.current
    const shape = id ? doc.shapes.find((s) => s.id === id) : undefined
    if (shape) startEditing(shape)
  }

  const removeSelected = () => {
    if (selectedIds.size === 0) return
    let next = docRef.current
    for (const id of selectedIds) next = removeShape(next, id)
    commit(next)
    setSelectedIds(new Set())
  }

  const duplicateSelected = () => {
    if (selectedIds.size === 0) return
    const { doc: next, newIds } = duplicateShapes(docRef.current, selectedIds, 12, 12)
    commit(next)
    setSelectedIds(new Set(newIds))
  }

  const nudgeSelected = (dx: number, dy: number) => {
    if (selectedIds.size === 0) return
    const current = docRef.current
    commit({
      ...current,
      shapes: current.shapes.map((s) => (selectedIds.has(s.id) ? translateShape(s, dx, dy) : s)),
    })
  }

  /** 팔레트·굵기·점선 — 선택 중이면 해당 도형들에 즉시 적용, 아니면 다음 도형 기본값 */
  const patchSelection = (patch: Partial<Shape>) => {
    let next = docRef.current
    for (const id of selectedIds) next = updateShape(next, id, patch)
    commit(next)
  }
  const changeRole = (key: RoleKey) => {
    setRole(key)
    if (selectedIds.size > 0) patchSelection({ role: key })
  }
  const changeWidth = (w: number) => {
    setStrokeWidth(w)
    if (selectedIds.size > 0) patchSelection({ strokeWidth: w })
  }
  const toggleDashed = () => {
    const next = single ? !single.dashed : !dashed
    setDashed(next)
    if (selectedIds.size > 0) patchSelection({ dashed: next })
  }

  const align = (mode: AlignMode) => commit(alignShapes(docRef.current, selectedIds, mode))
  const distribute = (axis: 'x' | 'y') => commit(distributeShapes(docRef.current, selectedIds, axis))

  const clearAll = () => {
    if (doc.shapes.length === 0) return
    if (!window.confirm('캔버스의 모든 도형을 지울까요? (되돌리기 가능)')) return
    commit(emptyDoc(doc.width, doc.height))
    setSelectedIds(new Set())
    setLoadedFrom(null)
  }

  /** svg 파일을 문서로 로드해 상태를 맞춘다 — apply(next)로 갱신 방식 선택 */
  const applyLoadedFile = async (name: string, apply: (next: DrawDoc) => void) => {
    const text = await apiRef.current.load(name)
    const loaded = text ? svgToDoc(text) : null
    if (!loaded) {
      window.alert(
        text
          ? '도형 문서 메타데이터가 없는 SVG라 편집할 수 없습니다.'
          : 'SVG를 불러오지 못했습니다.',
      )
      return
    }
    apply(loaded)
    setSelectedIds(new Set())
    setFileName(name.replace(/\.svg$/i, ''))
    setLoadedFrom(name)
  }

  // 본문 '도형 EDIT' 칩 진입 — 지정 파일을 열어 시작 (되돌리기 지점 없이 초기 상태로)
  useEffect(() => {
    if (!initialFile) return
    let cancelled = false
    void applyLoadedFile(initialFile, (next) => {
      if (!cancelled) applyDoc(next)
    })
    return () => {
      cancelled = true
    }
  }, [initialFile])

  const loadFile = async (name: string) => {
    if (
      doc.shapes.length > 0 &&
      !window.confirm('현재 캔버스를 불러온 문서로 교체할까요? (되돌리기 가능)')
    )
      return
    await applyLoadedFile(name, commit)
  }

  const apply = async () => {
    if (doc.shapes.length === 0) {
      window.alert('도형을 먼저 그려 주세요.')
      return
    }
    const base = fileName.trim() || 'drawing'
    const overwrite = loadedFrom !== null && `${base}.svg` === loadedFrom
    setBusy(true)
    try {
      const ok = await apiRef.current.save(docToSvg(doc), base, overwrite)
      if (ok) {
        localStorage.removeItem(DRAFT_KEY)
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  // 키보드: 도구(V/R/O/L/A/T) · Delete · Ctrl+Z/Y · Ctrl+D · Ctrl+[/] · 방향키 · Esc
  useEffect(() => {
    const TOOL_KEYS: Record<string, Tool> = {
      KeyV: 'select',
      KeyR: 'rect',
      KeyO: 'ellipse',
      KeyL: 'line',
      KeyA: 'arrow',
      KeyT: 'text',
    }
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === 'Escape') {
        if (editing) setEditing(null)
        else if (selectedIds.size > 0) setSelectedIds(new Set())
        else onClose()
        return
      }
      if (inField) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault()
        commit(bringToFront(docRef.current, selectedIds))
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault()
        commit(sendToBack(docRef.current, selectedIds))
        return
      }
      if (e.key.startsWith('Arrow') && selectedIds.size > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        nudgeSelected(dx, dy)
        return
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && TOOL_KEYS[e.code]) {
        setTool(TOOL_KEYS[e.code])
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 라벨 편집 입력의 오버레이 위치 (% — 캔버스 크기 변화에 무관)
  const editingShape = editing ? doc.shapes.find((s) => s.id === editing.id) : undefined
  const editingPos = editingShape
    ? (() => {
        const b = shapeBBox(editingShape)
        const cx = editingShape.kind === 'text' ? b.x : b.x + b.w / 2
        const cy = b.y + b.h / 2
        return { left: `${(cx / doc.width) * 100}%`, top: `${(cy / doc.height) * 100}%` }
      })()
    : null

  const activeDashed = single ? single.dashed : dashed
  const activeRole = single ? single.role : role
  const activeWidth = single ? single.strokeWidth : strokeWidth
  const canAlign = selection.length >= 2
  const canDistribute = selection.length >= 3
  const hasSelection = selectedIds.size > 0

  const tools: { key: Tool; label: string; title: string }[] = [
    { key: 'select', label: '선택', title: '선택·이동 (V) — Shift 다중, Alt+드래그 복제, 더블클릭 라벨' },
    { key: 'rect', label: '사각형', title: '드래그로 사각형 (R) — Shift 정사각, Alt 스냅 해제' },
    { key: 'ellipse', label: '타원', title: '드래그로 타원 (O) — Shift 정원' },
    { key: 'line', label: '선', title: '드래그로 선 (L) — Shift 45°, 도형 위에서 끝나면 바인딩' },
    { key: 'arrow', label: '화살표', title: '드래그로 화살표 (A) — Shift 45°, 도형 위에서 끝나면 바인딩' },
    { key: 'text', label: '텍스트', title: '클릭한 위치에 텍스트 (T)' },
  ]

  const aligns: { mode: AlignMode; label: string; title: string }[] = [
    { mode: 'left', label: '⇤', title: '왼쪽 맞춤' },
    { mode: 'hcenter', label: '⇹', title: '가로 중앙 맞춤' },
    { mode: 'right', label: '⇥', title: '오른쪽 맞춤' },
    { mode: 'top', label: '⤒', title: '위쪽 맞춤' },
    { mode: 'vcenter', label: '⇳', title: '세로 중앙 맞춤' },
    { mode: 'bottom', label: '⤓', title: '아래쪽 맞춤' },
  ]

  return createPortal(
    <div className="drawdlg-backdrop" onClick={onClose}>
      <div
        className="drawdlg"
        role="dialog"
        aria-label="도형 이미지 작성"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawdlg__title">
          도형 이미지 작성 — SVG
          <button type="button" className="drawdlg__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="drawdlg__tools" role="toolbar" aria-label="그리기 도구">
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.title}
              className={tool === t.key ? 'active' : ''}
              onClick={() => setTool(t.key)}
            >
              {t.label}
            </button>
          ))}
          <span className="drawdlg__sep" />
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              title={r.name}
              aria-label={`팔레트 ${r.name}`}
              className={`drawdlg__chip${activeRole === r.key ? ' active' : ''}`}
              onClick={() => changeRole(r.key)}
            >
              <span
                style={{
                  background: r.fill === 'none' ? 'transparent' : r.fill,
                  borderColor: r.stroke,
                }}
              />
            </button>
          ))}
          <span className="drawdlg__sep" />
          {[1, 2, 3].map((w) => (
            <button
              key={w}
              type="button"
              title={`선 굵기 ${w}`}
              className={activeWidth === w ? 'active' : ''}
              onClick={() => changeWidth(w)}
            >
              {w}px
            </button>
          ))}
          <button type="button" title="점선" className={activeDashed ? 'active' : ''} onClick={toggleDashed}>
            ┄
          </button>
          <span className="drawdlg__sep" />
          {aligns.map((a) => (
            <button
              key={a.mode}
              type="button"
              title={`${a.title} (2개 이상 선택)`}
              disabled={!canAlign}
              onClick={() => align(a.mode)}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            title="가로 등간격 분배 (3개 이상 선택)"
            disabled={!canDistribute}
            onClick={() => distribute('x')}
          >
            ↔
          </button>
          <button
            type="button"
            title="세로 등간격 분배 (3개 이상 선택)"
            disabled={!canDistribute}
            onClick={() => distribute('y')}
          >
            ↕
          </button>
          <span className="drawdlg__sep" />
          <button
            type="button"
            title="맨 앞으로 (Ctrl+])"
            disabled={!hasSelection}
            onClick={() => commit(bringToFront(docRef.current, selectedIds))}
          >
            앞
          </button>
          <button
            type="button"
            title="맨 뒤로 (Ctrl+[)"
            disabled={!hasSelection}
            onClick={() => commit(sendToBack(docRef.current, selectedIds))}
          >
            뒤
          </button>
          <button type="button" title="복제 (Ctrl+D, Alt+드래그)" disabled={!hasSelection} onClick={duplicateSelected}>
            복제
          </button>
          <button type="button" title="선택 도형 삭제 (Delete)" disabled={!hasSelection} onClick={removeSelected}>
            삭제
          </button>
          <span className="drawdlg__sep" />
          <button type="button" title="실행 취소 (Ctrl+Z)" onClick={undo}>
            ↶
          </button>
          <button type="button" title="다시 실행 (Ctrl+Shift+Z)" onClick={redo}>
            ↷
          </button>
          <button type="button" title="전체 비우기" onClick={clearAll}>
            비우기
          </button>
        </div>

        <div className="drawdlg__canvas">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${doc.width} ${doc.height}`}
            data-tool={tool}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
          >
            <defs>
              <pattern id="drawgrid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                  fill="none"
                  stroke="var(--nier-bg-dim)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width={doc.width} height={doc.height} fill="url(#drawgrid)" pointerEvents="none" />
            {doc.shapes.map((s) => (
              <ShapeView key={s.id} shape={s} />
            ))}
            {bindHint &&
              (() => {
                const target = doc.shapes.find((s) => s.id === bindHint)
                if (!target) return null
                const b = shapeBBox(target)
                return (
                  <rect
                    x={b.x - 4}
                    y={b.y - 4}
                    width={b.w + 8}
                    height={b.h + 8}
                    fill="none"
                    stroke="#b05a4a"
                    strokeWidth={1.5}
                    strokeDasharray="5,3"
                    pointerEvents="none"
                  />
                )
              })()}
            {!editing &&
              selection.map((s) => (
                <SelectionOverlay key={s.id} shape={s} withHandles={selection.length === 1} />
              ))}
            {marquee && (
              <rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.w}
                height={marquee.h}
                fill="rgba(76, 74, 67, 0.08)"
                stroke="#5d5a51"
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
            )}
          </svg>
          {editing && editingPos && (
            <textarea
              className="drawdlg__edit"
              style={editingPos}
              value={editing.value}
              placeholder="텍스트"
              rows={Math.max(1, editing.value.split('\n').length)}
              autoFocus
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEditing}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                // Enter 확정 · Shift+Enter 줄바꿈 · Esc 확정
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitEditing()
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  commitEditing()
                }
              }}
            />
          )}
        </div>

        <div className="drawdlg__footer">
          <span className="drawdlg__saved">
            {savedAt
              ? `임시 저장됨 ${new Date(savedAt).toLocaleTimeString('ko-KR', { hour12: false })}`
              : ''}
          </span>
          {fileList.length > 0 && (
            <select
              className="drawdlg__load"
              value=""
              title="게시물의 기존 도형 SVG 불러오기"
              onChange={(e) => {
                const name = e.target.value
                if (name) void loadFile(name)
              }}
            >
              <option value="">불러오기…</option>
              {fileList.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <label className="drawdlg__name">
            파일명
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              spellCheck={false}
            />
            .svg
          </label>
          <button type="button" className="btn" onClick={saveDraftNow}>
            임시 저장
          </button>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void apply()}>
            {busy
              ? '저장 중…'
              : loadedFrom && `${fileName.trim() || 'drawing'}.svg` === loadedFrom
                ? '덮어쓰기'
                : '적용'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 도형 렌더 — lib/draw/svg.ts의 내보내기와 시각적으로 동일해야 한다 */
function ShapeView({ shape }: { shape: Shape }) {
  const role = roleDef(shape.role)
  const dash = shape.dashed ? `${shape.strokeWidth * 3},${shape.strokeWidth * 2}` : undefined
  const common = {
    'data-id': shape.id,
    stroke: role.stroke,
    strokeWidth: shape.strokeWidth,
    strokeDasharray: dash,
  }
  switch (shape.kind) {
    case 'rect':
      return (
        <g>
          <rect {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={6} fill={role.fill} />
          {shape.text && <CenterLabel shape={shape} color={role.label} />}
        </g>
      )
    case 'ellipse':
      return (
        <g>
          <ellipse
            {...common}
            cx={shape.x + shape.w / 2}
            cy={shape.y + shape.h / 2}
            rx={shape.w / 2}
            ry={shape.h / 2}
            fill={role.fill}
          />
          {shape.text && <CenterLabel shape={shape} color={role.label} />}
        </g>
      )
    case 'line': {
      // 화살촉은 export와 동일한 비율로 선 끝에 직접 그린다 (marker 재정의 회피)
      const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1)
      const size = shape.strokeWidth * 8
      const wing = Math.PI / 7
      return (
        <g>
          <line {...common} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} fill="none" />
          {shape.arrow && (
            <polygon
              data-id={shape.id}
              fill={role.stroke}
              points={[
                `${shape.x2},${shape.y2}`,
                `${shape.x2 - size * Math.cos(angle - wing)},${shape.y2 - size * Math.sin(angle - wing)}`,
                `${shape.x2 - size * Math.cos(angle + wing)},${shape.y2 - size * Math.sin(angle + wing)}`,
              ].join(' ')}
            />
          )}
          {/* 가는 선도 집기 쉽도록 투명 히트 영역 */}
          <line
            data-id={shape.id}
            x1={shape.x1}
            y1={shape.y1}
            x2={shape.x2}
            y2={shape.y2}
            stroke="transparent"
            strokeWidth={12}
            fill="none"
          />
        </g>
      )
    }
    case 'text':
      return (
        <text data-id={shape.id} x={shape.x} y={shape.y} fontSize={shape.size} fill={role.stroke}>
          {shape.text.split('\n').map((line, i) => (
            <tspan key={i} x={shape.x} y={shape.y + i * shape.size * 1.4}>
              {line}
            </tspan>
          ))}
        </text>
      )
  }
}

function CenterLabel({ shape, color }: { shape: Shape & { kind: 'rect' | 'ellipse' }; color: string }) {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const lines = (shape.text ?? '').split('\n')
  return (
    <text
      data-id={shape.id}
      fontSize={16}
      fill={color}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * 16 * 1.4}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

/** 선택 표시 — bbox 점선 + (단일 선택 시) 리사이즈/끝점 핸들 */
function SelectionOverlay({ shape, withHandles }: { shape: Shape; withHandles: boolean }) {
  const b = shapeBBox(shape)
  const handles: { key: string; x: number; y: number }[] = !withHandles
    ? []
    : shape.kind === 'line'
      ? [
          { key: 'p1', x: shape.x1, y: shape.y1 },
          { key: 'p2', x: shape.x2, y: shape.y2 },
        ]
      : shape.kind === 'text'
        ? []
        : [
            { key: 'nw', x: b.x, y: b.y },
            { key: 'ne', x: b.x + b.w, y: b.y },
            { key: 'sw', x: b.x, y: b.y + b.h },
            { key: 'se', x: b.x + b.w, y: b.y + b.h },
          ]
  return (
    <g className="drawdlg__selection">
      <rect
        x={b.x - 3}
        y={b.y - 3}
        width={b.w + 6}
        height={b.h + 6}
        fill="none"
        stroke="#5d5a51"
        strokeWidth={1}
        strokeDasharray="4,3"
      />
      {handles.map((h) => (
        <rect
          key={h.key}
          data-handle={h.key}
          x={h.x - HANDLE / 2}
          y={h.y - HANDLE / 2}
          width={HANDLE}
          height={HANDLE}
          fill="#f2ecda"
          stroke="#4c4a43"
          strokeWidth={1.5}
        />
      ))}
    </g>
  )
}

export default DrawComposer
