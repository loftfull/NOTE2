import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the same dist/ works when Capacitor serves it from
  // the native WebView and when it is hosted under a sub-path. Navigation is
  // state-based (setPage), not history routing, so nothing depends on '/'.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Целевые браузеры заданы явно, и это не косметика.
    //
    // Vite 8 минифицирует CSS через lightningcss. Без указанных целей он
    // решил, что беспрефиксный `backdrop-filter` лишний, и оставлял в сборке
    // только `-webkit-backdrop-filter`. Chromium его не поддерживает
    // (CSS.supports('-webkit-backdrop-filter', 'blur(1px)') === false), и
    // размытие не применялось НИ НА ОДНОЙ поверхности: весь стеклянный стиль
    // оставался просто полупрозрачным. Сквозь шторки читалась страница под
    // ними.
    //
    // Safari до 18 требует префикс, поэтому в целях он есть — тогда
    // lightningcss оставляет оба свойства, а не выбирает одно.
    cssTarget: ['chrome107', 'edge107', 'firefox110', 'safari16'],
    rollupOptions: {
      output: {
        // pdfjs is large and only needed once a PDF is actually opened;
        // splitting it keeps it out of the initial parse on mobile.
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs'
          if (id.includes('node_modules/react')) return 'react'
        }
      }
    }
  },

  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' }
})
