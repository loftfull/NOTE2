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
