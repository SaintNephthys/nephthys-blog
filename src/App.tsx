import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppFrame from './components/layout/AppFrame'
import HomePage from './pages/HomePage'
import TagsPage from './pages/TagsPage'
import TagPage from './pages/TagPage'

// 무거운 의존성(KaTeX, highlight.js, 에디터)은 게시물/에디터 진입 시에만 로드
const PostPage = lazy(() => import('./pages/PostPage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))

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
          <Route
            path="editor"
            element={
              <Suspense fallback={<div className="loading">LOADING</div>}>
                <EditorPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
