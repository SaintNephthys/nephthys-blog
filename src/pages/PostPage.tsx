import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PostViewer from '../components/post/PostViewer'
import TableOfContents from '../components/post/TableOfContents'
import { fetchPostContent, fetchPostIndex, type PostMeta } from '../lib/posts'

interface LoadedPost {
  slug: string
  meta: PostMeta
  content: string
}

function PostPage() {
  const { slug } = useParams<{ slug: string }>()
  const [loaded, setLoaded] = useState<LoadedPost | null>(null)
  const [failure, setFailure] = useState<{ slug: string; message: string } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    Promise.all([fetchPostIndex(), fetchPostContent(slug)])
      .then(([posts, content]) => {
        if (cancelled) return
        const meta = posts.find((p) => p.slug === slug)
        if (!meta) {
          setFailure({ slug, message: '게시물을 찾을 수 없습니다.' })
          return
        }
        setLoaded({ slug, meta, content })
      })
      .catch((err: Error) => {
        if (!cancelled) setFailure({ slug, message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // slug가 바뀌면 이전 게시물/오류 상태는 무시하고 로딩으로 처리
  const post = loaded && loaded.slug === slug ? loaded : null
  const error = failure && failure.slug === slug ? failure.message : null

  if (error) {
    return (
      <>
        <div className="empty-note">{error}</div>
        <p style={{ textAlign: 'center' }}>
          <Link className="btn" to="/">
            ← BACK TO ARCHIVES
          </Link>
        </p>
      </>
    )
  }

  if (!post) {
    return <div className="loading">LOADING</div>
  }

  return (
    <div className="post-layout">
      <div className="post-layout__main">
        <PostViewer meta={post.meta} content={post.content} />
        <footer className="post-view__footer">
          <Link className="btn" to="/">
            ← ARCHIVES
          </Link>
        </footer>
      </div>
      <TableOfContents content={post.content} />
    </div>
  )
}

export default PostPage
