import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'
import process from 'node:process'
import {
  hasK6SameOriginBuildInput,
  validateK6SameOriginBuildConfig,
} from './src/config/sameOriginBuildContract.js'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && hasK6SameOriginBuildInput(env)) {
    const result = validateK6SameOriginBuildConfig(env)
    if (!result.valid) {
      throw new Error(`K6 same-origin build configuration is invalid: ${result.issues.join('; ')}`)
    }
  }

  // VITE_PROXY_TARGET:
  // - Local dev (npm run dev):  http://localhost:3000
  // - Docker dev (container):   http://nginx
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  return {
    cacheDir: '.vite-cache',
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
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
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
