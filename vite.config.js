import { defineConfig } from 'vite'
import { createApiMiddleware } from './server/api.js'

export default defineConfig({
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  plugins: [{
    name: 'smartsheet-api',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware())
    },
  }],
})
