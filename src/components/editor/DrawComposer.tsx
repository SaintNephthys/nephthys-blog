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
import {
  addShape,
  newShapeId,
  normalizeBox,
  removeShape,
  shapeBBox,
  translateShape,
  updateShape,
} from '../../lib/draw/ops'
import { docToSvg, svgToDoc } from '../../lib/draw/svg'
import { emptyDoc, type DrawDoc, type Shape } from '../../lib/draw/types'

/**
 * '도형' 버튼으로 열리는 SVG 이미지 작성 모달 — excalidraw식 클릭-드래그 캔버스.
 * NieR 테마 다이어그램 팔레트(lib/draw/palette) 기반 도형을 그려 SVG로 저장하고
 * 게시물 커서 위치에 ![](파일.svg)로 삽입한다.
 *
 * 구조 원칙: 이 컴포넌트는 표면(UI)일 뿐, 문서 모델·직렬화는 전부 lib/draw의
 * 순수 계층에 있다 — 차후 MCP/Agent가 같은 DrawDoc JSON을 생성·수정해 동일한
 * docToSvg 경로로 저장하는 것을 전제한 분리다.
 */

type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'

const DRAFT_KEY = 'nephthys-draw-doc'
const MIN_DRAW = 6 // 이보다 작은 드래그는 실수로 보고 버린다 (논리 px)
const HANDLE = 7

interface DraftPayload {
  doc: DrawDoc
  savedAt: string
}

function loadDraft(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { doc?: unknown; savedAt?: unknown }
    // 임베드 검증 로직 재사용을 위해 SVG 왕복으로 문서를 검증한다
    if (typeof parsed.savedAt !== 'string' || typeof parsed.doc !== 'object' || !parsed.doc)
      return null
    const doc = svgToDoc(docToSvg(parsed.doc as DrawDoc, { fit: false }))
    return doc ? { doc, savedAt: parsed.savedAt } : null
  } catch {
    return null
  }
}

type Gesture =
  | { type: 'draw'; id: string; startX: number; startY: number; before: DrawDoc }
  | { type: 'move'; id: string; lastX: number; lastY: number; moved: boolean; before: DrawDoc }
  | {
      type: 'handle'
      id: string
      handle: string
      startX: number
      startY: number
      origin: Shape
      before: DrawDoc
    }

interface DrawComposerProps {
  /** SVG 저장 + 게시물 삽입 위임 — 성공 시 true (모달을 닫는다) */
  onApply: (svgText: string, baseName: string) => Promise<boolean>
  onClose: () => void
}

function DrawComposer({ onApply, onClose }: DrawComposerProps) {
  const draft = useMemo(() => loadDraft(), [])
  const [doc, setDoc] = useState<DrawDoc>(() => draft?.doc ?? emptyDoc())
  const [tool, setTool] = useState<Tool>('rect')
  const [role, setRole] = useState<RoleKey>('alert')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [dashed, setDashed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [fileName, setFileName] = useState('drawing')
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null)
  const [busy, setBusy] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const docRef = useRef(doc)
  const gestureRef = useRef<Gesture | null>(null)
  // pointer capture가 이후 mouse 이벤트(dblclick)를 svg 루트로 재타게팅하므로
  // 캡처 전인 pointerdown 시점의 히트 도형을 기억해 둔다
  const lastHitRef = useRef<string | null>(null)
  const histRef = useRef<{ past: DrawDoc[]; future: DrawDoc[] }>({ past: [], future: [] })

  const applyDoc = (next: DrawDoc) => {
    docRef.current = next
    setDoc(next)
  }

  /** 되돌리기 지점과 함께 문서를 갱신 */
  const commit = (next: DrawDoc) => {
    histRef.current.past.push(docRef.current)
    histRef.current.future = []
    applyDoc(next)
  }

  const undo = () => {
    const h = histRef.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push(docRef.current)
    applyDoc(prev)
    setSelectedId(null)
  }

  const redo = () => {
    const h = histRef.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(docRef.current)
    applyDoc(next)
    setSelectedId(null)
  }

  // 임시 저장: 변경 500ms 후 자동 (명시적 버튼과 같은 저장소)
  useEffect(() => {
    if (doc.shapes.length === 0 && histRef.current.past.length === 0) return
    const timer = window.setTimeout(() => {
      const savedAtNow = new Date().toISOString()
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc, savedAt: savedAtNow }))
      setSavedAt(savedAtNow)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [doc])

  const saveDraftNow = () => {
    const savedAtNow = new Date().toISOString()
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc, savedAt: savedAtNow }))
    setSavedAt(savedAtNow)
  }

  const selected = selectedId ? doc.shapes.find((s) => s.id === selectedId) : undefined

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
    setSelectedId(shape.id)
    setEditing({ id: shape.id, value: shape.text ?? '' })
  }

  const commitEditing = () => {
    if (!editing) return
    const shape = docRef.current.shapes.find((s) => s.id === editing.id)
    setEditing(null)
    if (!shape) return
    const text = editing.value.trim()
    if (shape.kind === 'text') {
      // 빈 텍스트는 도형 제거 (생성 직후 취소 포함)
      commit(
        text
          ? updateShape(docRef.current, shape.id, { text })
          : removeShape(docRef.current, shape.id),
      )
      if (!text) setSelectedId(null)
    } else if (shape.kind !== 'line' && (shape.text ?? '') !== text) {
      commit(updateShape(docRef.current, shape.id, { text: text || undefined }))
    }
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || editing) return
    const pt = toCanvas(e)
    const before = docRef.current
    lastHitRef.current = findShapeId(e.target)

    // 선택된 도형의 리사이즈/끝점 핸들
    const handleName =
      e.target instanceof Element ? e.target.getAttribute('data-handle') : null
    if (handleName && selected) {
      gestureRef.current = {
        type: 'handle',
        id: selected.id,
        handle: handleName,
        startX: pt.x,
        startY: pt.y,
        origin: selected,
        before,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (tool === 'select') {
      const id = findShapeId(e.target)
      setSelectedId(id)
      if (id) {
        gestureRef.current = { type: 'move', id, lastX: pt.x, lastY: pt.y, moved: false, before }
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      return
    }

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
    setSelectedId(null)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gestureRef.current
    if (!g) return
    const pt = toCanvas(e)
    const current = docRef.current

    if (g.type === 'draw') {
      const shape = current.shapes.find((s) => s.id === g.id)
      if (!shape) return
      if (shape.kind === 'line') {
        applyDoc(updateShape(current, g.id, { x2: pt.x, y2: pt.y }))
      } else if (shape.kind === 'rect' || shape.kind === 'ellipse') {
        applyDoc(
          updateShape(current, g.id, normalizeBox(g.startX, g.startY, pt.x - g.startX, pt.y - g.startY)),
        )
      }
      return
    }

    if (g.type === 'move') {
      const dx = pt.x - g.lastX
      const dy = pt.y - g.lastY
      if (dx === 0 && dy === 0) return
      g.lastX = pt.x
      g.lastY = pt.y
      g.moved = true
      const shape = current.shapes.find((s) => s.id === g.id)
      if (shape)
        applyDoc({
          ...current,
          shapes: current.shapes.map((s) => (s.id === g.id ? translateShape(s, dx, dy) : s)),
        })
      return
    }

    // handle — 시작 시점 도형 기준으로 재계산 (누적 오차 없음)
    const { origin, handle } = g
    if (origin.kind === 'line') {
      applyDoc(
        updateShape(
          current,
          g.id,
          handle === 'p1' ? { x1: pt.x, y1: pt.y } : { x2: pt.x, y2: pt.y },
        ),
      )
      return
    }
    if (origin.kind === 'rect' || origin.kind === 'ellipse') {
      const right = origin.x + origin.w
      const bottom = origin.y + origin.h
      const anchorX = handle.includes('w') ? right : origin.x
      const anchorY = handle.includes('n') ? bottom : origin.y
      const box = normalizeBox(anchorX, anchorY, pt.x - anchorX, pt.y - anchorY)
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
    if (!g) return
    const current = docRef.current

    if (g.type === 'draw') {
      const shape = current.shapes.find((s) => s.id === g.id)
      if (!shape) return
      const b = shapeBBox(shape)
      if (Math.max(b.w, b.h) < MIN_DRAW) {
        applyDoc(g.before) // 실수 클릭 — 생성 취소
        return
      }
      histRef.current.past.push(g.before)
      histRef.current.future = []
      setSelectedId(g.id)
      setTool('select')
      return
    }

    if ((g.type === 'move' && g.moved) || g.type === 'handle') {
      histRef.current.past.push(g.before)
      histRef.current.future = []
    }
  }

  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const id = findShapeId(e.target) ?? lastHitRef.current
    const shape = id ? doc.shapes.find((s) => s.id === id) : undefined
    if (shape) startEditing(shape)
  }

  const removeSelected = () => {
    if (!selectedId) return
    commit(removeShape(docRef.current, selectedId))
    setSelectedId(null)
  }

  /** 팔레트·굵기·점선 — 선택 중이면 해당 도형에 즉시 적용, 아니면 다음 도형 기본값 */
  const changeRole = (key: RoleKey) => {
    setRole(key)
    if (selectedId) commit(updateShape(docRef.current, selectedId, { role: key }))
  }
  const changeWidth = (w: number) => {
    setStrokeWidth(w)
    if (selectedId) commit(updateShape(docRef.current, selectedId, { strokeWidth: w }))
  }
  const toggleDashed = () => {
    const next = selected ? !selected.dashed : !dashed
    setDashed(next)
    if (selectedId) commit(updateShape(docRef.current, selectedId, { dashed: next }))
  }

  const clearAll = () => {
    if (doc.shapes.length === 0) return
    if (!window.confirm('캔버스의 모든 도형을 지울까요? (되돌리기 가능)')) return
    commit(emptyDoc(doc.width, doc.height))
    setSelectedId(null)
  }

  const apply = async () => {
    if (doc.shapes.length === 0) {
      window.alert('도형을 먼저 그려 주세요.')
      return
    }
    setBusy(true)
    try {
      const ok = await onApply(docToSvg(doc), fileName.trim() || 'drawing')
      if (ok) {
        localStorage.removeItem(DRAFT_KEY)
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  // 키보드: Delete(도형 삭제) · Ctrl+Z/Y(undo/redo) · Esc(편집 취소→선택 해제→닫기)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === 'Escape') {
        if (editing) setEditing(null)
        else if (selectedId) setSelectedId(null)
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        commit(removeShape(docRef.current, selectedId))
        setSelectedId(null)
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
        const cy = editingShape.kind === 'text' ? b.y + b.h / 2 : b.y + b.h / 2
        return { left: `${(cx / doc.width) * 100}%`, top: `${(cy / doc.height) * 100}%` }
      })()
    : null

  const activeDashed = selected ? selected.dashed : dashed
  const activeRole = selected ? selected.role : role
  const activeWidth = selected ? selected.strokeWidth : strokeWidth

  const tools: { key: Tool; label: string; title: string }[] = [
    { key: 'select', label: '선택', title: '선택·이동 (더블클릭: 라벨 편집)' },
    { key: 'rect', label: '사각형', title: '드래그로 사각형' },
    { key: 'ellipse', label: '타원', title: '드래그로 타원' },
    { key: 'line', label: '선', title: '드래그로 선' },
    { key: 'arrow', label: '화살표', title: '드래그로 화살표' },
    { key: 'text', label: '텍스트', title: '클릭한 위치에 텍스트' },
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
          <button
            type="button"
            title="점선"
            className={activeDashed ? 'active' : ''}
            onClick={toggleDashed}
          >
            ┄
          </button>
          <span className="drawdlg__sep" />
          <button type="button" title="선택 도형 삭제 (Delete)" disabled={!selectedId} onClick={removeSelected}>
            삭제
          </button>
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
            {doc.shapes.map((s) => (
              <ShapeView key={s.id} shape={s} />
            ))}
            {selected && !editing && <SelectionOverlay shape={selected} />}
          </svg>
          {editing && editingPos && (
            <input
              className="drawdlg__edit"
              style={editingPos}
              value={editing.value}
              placeholder="텍스트"
              autoFocus
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEditing}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') commitEditing()
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
            {busy ? '저장 중…' : '적용'}
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
  const dash = shape.dashed
    ? `${shape.strokeWidth * 3},${shape.strokeWidth * 2}`
    : undefined
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

/** 선택 표시 — bbox 점선 + 리사이즈/끝점 핸들 */
function SelectionOverlay({ shape }: { shape: Shape }) {
  const b = shapeBBox(shape)
  const handles: { key: string; x: number; y: number }[] =
    shape.kind === 'line'
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
