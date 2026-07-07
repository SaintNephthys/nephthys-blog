import { useCallback, useEffect, useRef, useState } from 'react'
import CategoryManager from '../components/editor/CategoryManager'
import MarkdownToolbar from '../components/editor/MarkdownToolbar'
import MarkdownRenderer from '../components/post/MarkdownRenderer'
import Panel from '../components/widgets/Panel'
import { invalidatePostIndex } from '../lib/posts'
import {
  deletePost,
  deploy,
  fetchDeployPreview,
  getPost,
  listCategories,
  listPosts,
  savePost,
  uploadImage,
  type CategoryInfo,
  type DeployPreview,
  type EditorPost,
  type EditorPostMeta,
} from '../lib/editorApi'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface StatusMessage {
  text: string
  error?: boolean
}

// 로컬 dev 전용 페이지 — App.tsx가 DEV일 때만 라우트를 등록하므로 프로덕션에서는 로드되지 않는다
type EditorTab = 'posts' | 'categories'

function EditorPage() {
  const [tab, setTab] = useState<EditorTab>('posts')
  const [posts, setPosts] = useState<EditorPostMeta[]>([])
  const [allCategories, setAllCategories] = useState<CategoryInfo[]>([])
  const [form, setForm] = useState<EditorPost | null>(null)
  const [tagsInput, setTagsInput] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [deployInfo, setDeployInfo] = useState<{
    preview: DeployPreview
    message: string
  } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshList = useCallback(async () => {
    const { posts: list } = await listPosts()
    setPosts(list)
  }, [])

  const refreshCategories = useCallback(async () => {
    const { categories: list } = await listCategories()
    setAllCategories(list)
  }, [])

  // 카테고리 편집 탭에서 변경 시: 목록·게시물을 다시 읽고, 이름이 바뀌면 열려 있는 폼도 따라간다
  const handleCategoriesChanged = useCallback(
    async (rename?: { from: string; to: string }) => {
      await Promise.all([refreshCategories(), refreshList()])
      if (rename) {
        setForm((prev) =>
          prev && prev.category === rename.from ? { ...prev, category: rename.to } : prev,
        )
      }
    },
    [refreshCategories, refreshList],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([listPosts(), listCategories()])
      .then(([{ posts: list }, { categories: cats }]) => {
        if (cancelled) return
        setPosts(list)
        setAllCategories(cats)
      })
      .catch((err: Error) => {
        if (!cancelled) setStatus({ text: err.message, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const confirmDiscard = () =>
    !dirty || window.confirm('저장하지 않은 변경 사항이 있습니다. 계속할까요?')

  const updateForm = (patch: Partial<EditorPost>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  const selectPost = async (slug: string) => {
    if (!confirmDiscard()) return
    try {
      const post = await getPost(slug)
      setForm(post)
      setTagsInput(post.tags.join(', '))
      setIsNew(false)
      setDirty(false)
      setStatus(null)
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true })
    }
  }

  const newPost = () => {
    if (!confirmDiscard()) return
    setForm({
      slug: `${today()}-untitled`,
      title: '',
      date: today(),
      category: '',
      tags: [],
      summary: '',
      draft: true,
      content: '',
    })
    setTagsInput('')
    setIsNew(true)
    setDirty(true)
    setStatus(null)
  }

  const save = async (overrides?: Partial<EditorPost>): Promise<boolean> => {
    if (!form) return false
    const post: EditorPost = {
      ...form,
      ...overrides,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }
    setBusy(true)
    try {
      await savePost(post)
      setForm(post)
      setIsNew(false)
      setDirty(false)
      setStatus({
        text: `SAVED ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}${post.draft ? ' (DRAFT)' : ''}`,
      })
      await Promise.all([refreshList(), refreshCategories()])
      invalidatePostIndex() // 사이드바 카테고리 등 공개 index 사용처 즉시 갱신
      return true
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true })
      return false
    } finally {
      setBusy(false)
    }
  }

  /** 커서 위치에 텍스트 삽입 (도구바의 선택 복원 패턴과 동일) */
  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: start, selectionEnd: end, value } = ta
    updateForm({ content: value.slice(0, start) + text + value.slice(end) })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + text.length, start + text.length)
    })
  }

  /** 이미지 업로드 → 커서 위치에 ![](파일명) 삽입. 미저장 새 글은 먼저 자동 저장한다. */
  const uploadImages = async (files: File[]) => {
    if (!form) return
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    // 서버에 게시물 파일이 있어야 저장 위치(공개/초안)가 정해진다
    if (isNew && !(await save())) return
    setBusy(true)
    try {
      for (const file of images) {
        setStatus({ text: `이미지 업로드 중… ${file.name}` })
        const { file: saved } = await uploadImage(form.slug, file)
        insertAtCursor(`![](${saved})`)
      }
      setStatus({ text: `이미지 ${images.length}개 업로드 완료` })
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const togglePublish = () => {
    if (!form) return
    const next = !form.draft
    if (
      !next &&
      !window.confirm('이 게시물을 게시 상태로 전환합니다. 다음 배포부터 블로그에 공개됩니다.')
    )
      return
    void save({ draft: next })
  }

  const removePost = async () => {
    if (!form || isNew) return
    if (!window.confirm(`"${form.title || form.slug}" 게시물을 삭제할까요?`)) return
    setBusy(true)
    try {
      await deletePost(form.slug)
      setForm(null)
      setDirty(false)
      setStatus({ text: 'DELETED' })
      await Promise.all([refreshList(), refreshCategories()])
      invalidatePostIndex()
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const openDeploy = async () => {
    if (dirty && !window.confirm('저장하지 않은 변경 사항은 배포에 포함되지 않습니다. 계속할까요?'))
      return
    setBusy(true)
    try {
      const preview = await fetchDeployPreview()
      setDeployInfo({ preview, message: `게시물 업데이트 (${today()})` })
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const runDeploy = async () => {
    if (!deployInfo) return
    setBusy(true)
    try {
      const { log } = await deploy(deployInfo.message)
      setDeployInfo(null)
      setStatus({ text: `DEPLOY: ${log.join(' / ')}` })
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const published = posts.filter((p) => !p.draft)
  const drafts = posts.filter((p) => p.draft)

  // 드롭다운에 노출할 카테고리 목록 (categories.json + 게시물 파생 + 현재 입력값)
  const categorySet = new Set(allCategories.map((c) => c.name))
  if (form?.category) categorySet.add(form.category)
  const categories = [...categorySet].sort((a, b) => a.localeCompare(b, 'ko'))

  const changeCategory = (value: string) => {
    if (value === '__new__') {
      const name = window.prompt('새 카테고리 이름을 입력하세요')?.trim()
      if (name) updateForm({ category: name })
    } else {
      updateForm({ category: value })
    }
  }

  return (
    <>
      <h1 className="page-title">EDITOR</h1>
      <div className="editor-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'posts'}
          className={`editor-tabs__tab${tab === 'posts' ? ' active' : ''}`}
          onClick={() => setTab('posts')}
        >
          포스팅
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'categories'}
          className={`editor-tabs__tab${tab === 'categories' ? ' active' : ''}`}
          onClick={() => setTab('categories')}
        >
          카테고리 편집
        </button>
      </div>
      <p className="page-subtitle">
        {tab === 'posts' ? '작성 → 저장 → 게시 → 배포' : '카테고리 추가 · 삭제'}
      </p>

      {tab === 'categories' && (
        <CategoryManager categories={allCategories} onChanged={handleCategoriesChanged} />
      )}

      {/* 탭을 오가도 작성 중인 폼이 유지되도록 언마운트 대신 숨긴다 */}
      <div className={`editor${tab === 'posts' ? '' : ' editor--hidden'}`}>
        <aside className="editor__list">
          <button type="button" className="btn btn--primary" onClick={newPost}>
            + NEW POST
          </button>

          <div className="editor__group-title">DRAFTS ({drafts.length})</div>
          {drafts.map((p) => (
            <PostItem key={p.slug} post={p} active={form?.slug === p.slug} onSelect={selectPost} />
          ))}
          {drafts.length === 0 && <div className="editor__group-title">- empty -</div>}

          <div className="editor__group-title">PUBLISHED ({published.length})</div>
          {published.map((p) => (
            <PostItem key={p.slug} post={p} active={form?.slug === p.slug} onSelect={selectPost} />
          ))}
        </aside>

        {form ? (
          <div className="editor__form">
            <div className="form-row">
              <div className="field">
                <label htmlFor="ed-title">TITLE</label>
                <input
                  id="ed-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => updateForm({ title: e.target.value })}
                />
              </div>
              <div className="field" style={{ maxWidth: 160 }}>
                <label htmlFor="ed-date">DATE</label>
                <input
                  id="ed-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => updateForm({ date: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="ed-slug">SLUG {isNew ? '' : '(고정)'}</label>
                <input
                  id="ed-slug"
                  type="text"
                  value={form.slug}
                  readOnly={!isNew}
                  onChange={(e) => updateForm({ slug: e.target.value })}
                />
              </div>
              <div className="field" style={{ maxWidth: 220 }}>
                <label htmlFor="ed-category">CATEGORY</label>
                <select
                  id="ed-category"
                  value={form.category}
                  onChange={(e) => changeCategory(e.target.value)}
                >
                  <option value="">(없음)</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__new__">+ 새 카테고리…</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="ed-tags">TAGS (쉼표 구분)</label>
                <input
                  id="ed-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value)
                    setDirty(true)
                  }}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="ed-summary">SUMMARY</label>
                <input
                  id="ed-summary"
                  type="text"
                  value={form.summary}
                  onChange={(e) => updateForm({ summary: e.target.value })}
                />
              </div>
            </div>

            <MarkdownToolbar
              textareaRef={textareaRef}
              onChange={(content) => updateForm({ content })}
              onUploadImages={(files) => void uploadImages(files)}
            />
            <textarea
              ref={textareaRef}
              className="editor__textarea"
              value={form.content}
              onChange={(e) => updateForm({ content: e.target.value })}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files)
                if (files.some((f) => f.type.startsWith('image/'))) {
                  e.preventDefault()
                  void uploadImages(files)
                }
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) e.preventDefault()
              }}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files)
                if (files.some((f) => f.type.startsWith('image/'))) {
                  e.preventDefault()
                  void uploadImages(files)
                }
              }}
              placeholder="Markdown 본문… ($수식$, ```코드```, 표 지원 · 이미지 붙여넣기/드롭 업로드)"
            />

            <div className="editor__toolbar">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
                SAVE
              </button>
              <button type="button" className="btn" disabled={busy} onClick={togglePublish}>
                {form.draft ? 'PUBLISH' : 'UNPUBLISH'}
              </button>
              <button type="button" className="btn btn--danger" disabled={busy || isNew} onClick={() => void removePost()}>
                DELETE
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void openDeploy()}>
                DEPLOY ▲
              </button>
              <span className={`editor__status${status?.error ? ' error' : ''}`}>
                {status?.text ?? (dirty ? 'UNSAVED*' : '')}
              </span>
            </div>
          </div>
        ) : (
          <Panel title="NO POST SELECTED">
            <p>좌측 목록에서 게시물을 선택하거나 새 글을 작성하세요.</p>
            <p>
              새 글은 <strong>draft</strong> 상태로 생성되며, 게시(PUBLISH) 후
              배포(DEPLOY)해야 블로그에 공개됩니다.
            </p>
          </Panel>
        )}

        {form && (
          <div className="editor__preview">
            <MarkdownRenderer
              content={form.content || '*프리뷰: 본문을 입력하세요.*'}
              assetBase={`${import.meta.env.BASE_URL}posts/images/${form.slug}/`}
            />
          </div>
        )}
      </div>

      {deployInfo && (
        <DeployDialog
          info={deployInfo}
          busy={busy}
          onMessageChange={(message) => setDeployInfo({ ...deployInfo, message })}
          onConfirm={() => void runDeploy()}
          onCancel={() => setDeployInfo(null)}
        />
      )}
    </>
  )
}

function PostItem({
  post,
  active,
  onSelect,
}: {
  post: EditorPostMeta
  active: boolean
  onSelect: (slug: string) => void
}) {
  return (
    <button
      type="button"
      className={`editor__post-item${active ? ' active' : ''}`}
      onClick={() => void onSelect(post.slug)}
    >
      <span className="title">{post.title || post.slug}</span>
      <span className={`badge ${post.draft ? 'badge--draft' : 'badge--published'}`}>
        {post.draft ? 'DRAFT' : 'PUB'}
      </span>
    </button>
  )
}

function DeployDialog({
  info,
  busy,
  onMessageChange,
  onConfirm,
  onCancel,
}: {
  info: { preview: DeployPreview; message: string }
  busy: boolean
  onMessageChange: (message: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { preview } = info
  const nothingPublic =
    preview.publish.length === 0 &&
    preview.unpublish.length === 0 &&
    preview.update.length === 0

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3 className="panel__title">DEPLOY CONFIRM</h3>
        <div className="dialog__body">
          {preview.publish.length > 0 && (
            <div className="dialog__section">
              <h4 className="publish">▲ 새로 공개</h4>
              <ul>{preview.publish.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {preview.unpublish.length > 0 && (
            <div className="dialog__section">
              <h4 className="unpublish">▼ 비공개 전환</h4>
              <ul>{preview.unpublish.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {preview.update.length > 0 && (
            <div className="dialog__section">
              <h4>◆ 내용 갱신</h4>
              <ul>{preview.update.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {preview.drafts.length > 0 && (
            <div className="dialog__section">
              <h4>· DRAFT (공개되지 않음)</h4>
              <ul>{preview.drafts.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {nothingPublic && (
            <div className="dialog__section">
              <p>공개 상태가 바뀌는 게시물이 없습니다.</p>
            </div>
          )}
          <div className="dialog__section">
            <h4>COMMIT MESSAGE</h4>
            <input
              type="text"
              value={info.message}
              onChange={(e) => onMessageChange(e.target.value)}
            />
          </div>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            CANCEL
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'DEPLOYING…' : 'DEPLOY'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditorPage
