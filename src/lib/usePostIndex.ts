import { useEffect, useState } from 'react'
import { fetchPostIndex, subscribePostIndex, type PostMeta } from './posts'

interface PostIndexState {
  posts: PostMeta[]
  /** 전체 카테고리 이름 (게시물 0개 카테고리 포함) */
  categories: string[]
  loading: boolean
  error: string | null
}

export function usePostIndex(): PostIndexState {
  const [state, setState] = useState<PostIndexState>({
    posts: [],
    categories: [],
    loading: true,
    error: null,
  })
  // invalidatePostIndex()가 호출되면 version이 올라가 재조회 effect가 다시 실행된다
  const [version, setVersion] = useState(0)

  useEffect(() => subscribePostIndex(() => setVersion((v) => v + 1)), [])

  useEffect(() => {
    let cancelled = false
    fetchPostIndex()
      .then(({ posts, categories }) => {
        if (!cancelled) setState({ posts, categories, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ posts: [], categories: [], loading: false, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [version])

  return state
}
