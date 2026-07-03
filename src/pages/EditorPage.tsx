import { useCallback, useEffect, useState } from 'react'
import MarkdownRenderer from '../components/post/MarkdownRenderer'
import Panel from '../components/widgets/Panel'
import {
  deletePost,
  deploy,
  fetchDeployPreview,
  getPost,
  listPosts,
  savePost,
  type DeployPreview,
  type EditorPost,
  type EditorPostMeta,
} from '../lib/editorApi'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function EditorPage() {
  // 정적 배포본에는 에디터 API가 없다 — 로컬 dev 서버에서만 동작
  if (!import.meta.env.DEV) {
    return (
      <div className="editor-notice">
        <Panel title="EDITOR — OFFLINE">
          <p>
            에디터는 로컬 개발 서버에서만 사용할 수 있습니다. 저장소를 클론한 뒤
            아래 명령으로 dev 서버를 실행하고 다시 접속하세요.
          </p>
          <pre style={{ padding: '10px 14px' }}>
            <code>npm run dev</code>
          </pre>
        </Panel>
      </div>
    )
  }
  return <EditorWorkspace />
}

interface StatusMessage {
  text: string
  error?: boolean
}

function EditorWorkspace() {
  const [posts, setPosts] = useState<EditorPostMeta[]>([])
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

  const refreshList = useCallback(async () => {
    const { posts: list } = await listPosts()
    setPosts(list)
  }, [])

  useEffect(() => {
    let cancelled = false
    listPosts()
      .then(({ posts: list }) => {
        if (!cancelled) setPosts(list)
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

  const save = async (overrides?: Partial<EditorPost>) => {
    if (!form) return
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
      await refreshList()
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
      await refreshList()
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

  return (
    <>
      <h1 className="page-title">EDITOR</h1>
      <p className="page-subtitle">작성 → 저장 → 게시 → 배포</p>

      <div className="editor">
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

            <textarea
              className="editor__textarea"
              value={form.content}
              onChange={(e) => updateForm({ content: e.target.value })}
              placeholder="Markdown 본문… ($수식$, ```코드```, 표 지원)"
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
            <MarkdownRenderer content={form.content || '*프리뷰: 본문을 입력하세요.*'} />
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
