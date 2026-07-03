import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error — 타입 선언 없는 로컬 JS 모듈 (dev 전용 에디터 API)
import { editorApiPlugin } from './scripts/editor-plugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages: https://saintnephthys.github.io/nephthys-blog/
  base: '/nephthys-blog/',
  plugins: [react(), editorApiPlugin()],
})
