import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      '/proxy': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: () => '/',  // 前端 /proxy 映射到后端 /，由 catch-all proxyRouter 处理
      },
    },
  },
  build: {
    outDir: '../data/web',
    emptyOutDir: true,
  },
})
