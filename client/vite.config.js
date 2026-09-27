import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the heavy third-party libraries into their own long-lived
         * chunks. Without this, everything lands in one bundle keyed to the app
         * hash, so changing a single line of application code forces every
         * returning visitor to re-download React, Recharts, Firebase and
         * Socket.IO. Vendor code changes rarely; it should be cached
         * separately from app code.
         *
         * Matched by path rather than by a list of package names. The list
         * form matches on exact module ids, so `react-dom` was listed but
         * `main.jsx` imports `react-dom/client` — a different id — and the
         * ~130 kB of react-dom ended up in the entry chunk anyway, which is
         * the one chunk that is invalidated by every deploy.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)/.test(id)) {
            return 'vendor-react'
          }
          // Only reached from the Insights route, which is lazy — so this
          // chunk is never requested by a user who does not open it.
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-)/.test(id)) {
            return 'vendor-charts'
          }
          if (/[\\/]node_modules[\\/]@?firebase/.test(id)) {
            return 'vendor-firebase'
          }
          if (/[\\/]node_modules[\\/](socket\.io|engine\.io)/.test(id)) {
            return 'vendor-realtime'
          }
          // Reached only through the dynamic import in services/errorTracking.js,
          // and only when VITE_SENTRY_DSN is set — never part of the first load.
          if (/[\\/]node_modules[\\/]@sentry/.test(id)) {
            return 'vendor-sentry'
          }

          /**
           * Everything else is left to Rollup.
           *
           * A catch-all `vendor` bucket looks tidier but creates a genuine
           * cycle: react-hot-toast lands in `vendor` and imports react from
           * `vendor-react`, while react-router's own dependencies land back in
           * `vendor` — so the two chunks import each other and neither can be
           * evaluated first. Letting the remaining small packages sit in the
           * chunks that actually use them avoids that entirely.
           */
          return undefined
        },
      },
    },
    // Firebase alone exceeds 500 kB; the default warning is pure noise here.
    chunkSizeWarningLimit: 700,
  },
})
