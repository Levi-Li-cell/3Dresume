import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore — 开发期插件（贴纸编辑器 API），无类型声明，见 scripts/sticker-editor-api.mjs
import stickerEditorApi from './scripts/sticker-editor-api.mjs'

export default defineConfig({
  // Commerce service serves the SPA from the domain root, so direct routes such
  // as /account and /studio must resolve assets from /assets.
  base: '/',
  plugins: [react(), stickerEditorApi()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/assets': 'http://127.0.0.1:8787',
    },
  },
})
