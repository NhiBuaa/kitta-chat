import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import process from 'node:process'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // VITE_PROXY_TARGET:
  // - Local dev (npm run dev):  http://localhost:3000
  // - Docker dev (container):   http://nginx
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      tailwindcss(),
      nodePolyfills(),
    ],
    define: {
      global: 'window',
    },
    server: {
      host: true,
      strictPort: true,
      port: 5173,
      watch: {
        usePolling: true,
        interval: 300,
      },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: proxyTarget,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})