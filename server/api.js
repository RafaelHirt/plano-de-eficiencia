import { ApiError, createSmartsheetClient, readSelection } from './smartsheet.js'

export function createApiMiddleware(client = createSmartsheetClient()) {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const host = req.headers.host ?? ''
      const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
      const sameOrigin = !req.headers.origin || ['http://' + host, 'https://' + host].includes(req.headers.origin)
      if (!loopback || !sameOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
        throw new ApiError(403, 'A API está disponível para a sessão local do painel.')
      }
      if (req.method !== 'GET') throw new ApiError(405, 'A integração permite consultas de leitura.')
      const url = new URL(req.url, 'http://localhost')
      let data
      if (url.pathname === '/api/smartsheet/sheets') {
        data = await client.catalog(true)
      } else if (url.pathname === '/api/smartsheet/snapshot') {
        data = await client.snapshot(readSelection(url.searchParams))
      } else {
        const match = url.pathname.match(/^\/api\/smartsheet\/sheets\/([1-9]\d{0,18})\/columns$/)
        if (!match) throw new ApiError(404, 'Consulta indisponível.')
        data = await client.columns(match[1])
      }
      res.end(JSON.stringify(data))
    } catch (error) {
      res.statusCode = error instanceof ApiError ? error.status : 500
      if (error instanceof ApiError && error.retryAfter) res.setHeader('Retry-After', error.retryAfter)
      res.end(JSON.stringify({
        message: error instanceof ApiError ? error.message : 'Falha ao ler a fonte de dados.',
      }))
    }
  }
}
