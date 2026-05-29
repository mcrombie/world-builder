import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src') }
  },
  plugins: [react()],
  define: {
    'import.meta.env.VITE_PLATFORM': '"browser"'
  },
  base: '/world-builder/',
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
  },
})
