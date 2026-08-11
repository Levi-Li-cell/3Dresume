import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore — 开发期插件（贴纸编辑器 API），无类型声明，见 scripts/sticker-editor-api.mjs
import stickerEditorApi from './scripts/sticker-editor-api.mjs'

export default defineConfig({
  // 打包后资源用相对路径（dist/index.html 引用 ./assets/...，可放任意子目录/直接打开）
  base: './',
  plugins: [react(), stickerEditorApi()],
  server: { host: true, port: 5173 },
})
