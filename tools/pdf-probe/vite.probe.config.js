import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Отдельная сборка: стенд не должен попадать в приложение.
export default defineConfig({
  root: resolve(import.meta.dirname),
  build: {
    outDir: resolve(import.meta.dirname, '../../.probe-dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'pdf-probe.html') }
  }
})
