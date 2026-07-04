import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppFrame from './components/layout/AppFrame'
import HomePage from './pages/HomePage'
import TagsPage from './pages/TagsPage'
import TagPage from './pages/TagPage'
import CategoryPage from './pages/CategoryPage'
import SearchPage from './pages/SearchPage'

// 무거운 의존성(KaTeX, highlight.js, 에디터)은 게시물/에디터 진입 시에만 로드
const PostPage = lazy(() => import('./pages/PostPage'))
// 에디터는 로컬 dev 전용 — 프로덕션 빌드에서는 라우트와 청크가 모두 제거된다
const EditorPage = import.meta.env.DEV
  ? lazy(() => import('./pages/EditorPage'))
  : null

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppFrame />}>
          <Route index element={<HomePage />} />
          <Route
            path="post/:slug"
            element={
              <Suspense fallback={<div className="loading">LOADING</div>}>
                <PostPage />
              </Suspense>
            }
          />
          <Route path="tags" element={<TagsPage />} />
          <Route path="tag/:tag" element={<TagPage />} />
          <Route path="category/:category" element={<CategoryPage />} />
          <Route path="search/:query" element={<SearchPage />} />
          {EditorPage && (
            <Route
              path="editor"
              element={
                <Suspense fallback={<div className="loading">LOADING</div>}>
                  <EditorPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
