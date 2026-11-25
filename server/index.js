import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { createApiMiddleware } from './api.js'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
if (!existsSync(dist + 'index.html')) {
  console.error('Execute npm run build antes de iniciar o painel.')
  process.exit(1)
}

const serve = sirv(dist, { etag: true })
const api = createApiMiddleware()
const port = Number(process.env.PORT ?? 3000)
const server = createServer((req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  api(req, res, () => serve(req, res, () => {
    res.statusCode = 404
    res.end('Página não encontrada.')
  }))
})

server.listen(port, '127.0.0.1', () => {
  console.log('Painel disponível em http://127.0.0.1:' + server.address().port)
})
