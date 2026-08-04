import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PostViewer from '../components/post/PostViewer'
import ReadingProgress from '../components/post/ReadingProgress'
import TableOfContents from '../components/post/TableOfContents'
import { fetchPostContent, fetchPostIndex, type PostMeta } from '../lib/posts'

interface LoadedPost {
  slug: string
  meta: PostMeta
  content: string
  /** 날짜 내림차순 목록에서의 이웃 — older = 이전(과거) 글, newer = 다음(최신) 글 */
  older: PostMeta | null
  newer: PostMeta | null
}

function PostPage() {
  const { slug } = useParams<{ slug: string }>()
  const [loaded, setLoaded] = useState<LoadedPost | null>(null)
  const [failure, setFailure] = useState<{ slug: string; message: string } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    Promise.all([fetchPostIndex(), fetchPostContent(slug)])
      .then(([index, content]) => {
        if (cancelled) return
        const idx = index.posts.findIndex((p) => p.slug === slug)
        if (idx === -1) {
          setFailure({ slug, message: '게시물을 찾을 수 없습니다.' })
          return
        }
        setLoaded({
          slug,
          meta: index.posts[idx],
          content,
          // index.json은 날짜 내림차순 — 다음 원소가 과거 글, 이전 원소가 최신 글
          older: index.posts[idx + 1] ?? null,
          newer: index.posts[idx - 1] ?? null,
        })
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
      <ReadingProgress />
      <div className="post-layout__main">
        <PostViewer meta={post.meta} content={post.content} />
        {(post.older || post.newer) && (
          <nav className="post-nav" aria-label="이전/다음 글">
            {post.older ? (
              <Link className="post-nav__card" to={`/post/${post.older.slug}`}>
                <span className="post-nav__dir">← PREV</span>
                <span className="post-nav__title">{post.older.title}</span>
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            {post.newer && (
              <Link
                className="post-nav__card post-nav__card--next"
                to={`/post/${post.newer.slug}`}
              >
                <span className="post-nav__dir">NEXT →</span>
                <span className="post-nav__title">{post.newer.title}</span>
              </Link>
            )}
          </nav>
        )}
      </div>
      <TableOfContents content={post.content} />
    </div>
  )
}

export default PostPage
