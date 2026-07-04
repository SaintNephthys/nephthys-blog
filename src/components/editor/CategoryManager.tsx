import { useState } from 'react'
import Panel from '../widgets/Panel'
import {
  addCategory,
  deleteCategory,
  renameCategory,
  type CategoryInfo,
} from '../../lib/editorApi'
import { invalidatePostIndex } from '../../lib/posts'

interface CategoryManagerProps {
  categories: CategoryInfo[]
  /** rename이 있으면 {from, to}를 전달해 열려 있는 폼 등의 참조를 갱신할 수 있게 한다 */
  onChanged: (rename?: { from: string; to: string }) => Promise<void>
}

/**
 * 에디터 "카테고리 편집" 탭 — 목록 제시 + 추가/이름 수정/삭제.
 * 이름 수정은 사용 중인 게시물 frontmatter까지 서버가 일괄 갱신하고,
 * 게시물이 사용 중인 카테고리는 삭제 불가.
 */
function CategoryManager({ categories, onChanged }: CategoryManagerProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (
    action: () => Promise<unknown>,
    rename?: { from: string; to: string },
  ) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged(rename)
      invalidatePostIndex()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void run(async () => {
      await addCategory(trimmed)
      setName('')
    })
  }

  const rename = (target: string) => {
    const next = window.prompt(`"${target}" 카테고리의 새 이름을 입력하세요`, target)?.trim()
    if (!next || next === target) return
    void run(() => renameCategory(target, next), { from: target, to: next })
  }

  const remove = (target: string) => {
    if (!window.confirm(`"${target}" 카테고리를 삭제할까요?`)) return
    void run(() => deleteCategory(target))
  }

  return (
    <div className="category-manager">
      <Panel title={`CATEGORIES (${categories.length})`}>
        <form
          className="category-manager__add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            type="text"
            value={name}
            placeholder="새 카테고리 이름"
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
            + ADD
          </button>
        </form>

        {error && <p className="category-manager__error">{error}</p>}

        {categories.length === 0 ? (
          <p className="category-manager__empty">카테고리가 없습니다. 위에서 추가하세요.</p>
        ) : (
          <ul className="category-manager__list">
            {categories.map((c) => (
              <li key={c.name} className="category-manager__row">
                <span className="category-manager__name">{c.name}</span>
                <span className="category-manager__count">게시물 {c.count}개</span>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => rename(c.name)}
                >
                  RENAME
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy || c.count > 0}
                  title={c.count > 0 ? '게시물이 있는 카테고리는 삭제할 수 없습니다' : undefined}
                  onClick={() => remove(c.name)}
                >
                  DELETE
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export default CategoryManager
