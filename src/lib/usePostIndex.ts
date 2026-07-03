import { useEffect, useState } from 'react'
import { fetchPostIndex, type PostMeta } from './posts'

interface PostIndexState {
  posts: PostMeta[]
  loading: boolean
  error: string | null
}

export function usePostIndex(): PostIndexState {
  const [state, setState] = useState<PostIndexState>({
    posts: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    fetchPostIndex()
      .then((posts) => {
        if (!cancelled) setState({ posts, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ posts: [], loading: false, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
