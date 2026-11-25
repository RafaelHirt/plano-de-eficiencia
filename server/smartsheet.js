import { EnvHttpProxyAgent, fetch } from 'undici'
import { amounts, fields, normalize, normalizeBalances } from '../src/data.js'
import { workspaceName, workspaceUrl } from '../src/config.js'

const apiUrl = 'https://api.smartsheet.com/2.0'
const pageSize = 1000
const idPattern = /^[1-9]\d{0,18}$/

export class ApiError extends Error {
  constructor(status, message, retryAfter = 0) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

function matchesWorkspace(permalink) {
  try {
    const expected = new URL(workspaceUrl)
    const actual = new URL(permalink)
    const path = actual.pathname.replace(/\/$/, '')
    return actual.origin === expected.origin && (
      path === expected.pathname ||
      path === '/r/browse/' + expected.pathname.split('/').at(-1) ||
      actual.searchParams.get('lx') === expected.pathname.split('/').at(-1)
    )
  } catch {
    return false
  }
}

function retryDelay(header) {
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const fromDate = Math.ceil((Date.parse(header) - Date.now()) / 1000)
  return fromDate > 0 ? fromDate : 60
}

function readCell(cell, field) {
  if (!cell) return null
  return field === 'month' ? cell.displayValue ?? cell.value : cell.value ?? cell.displayValue
}

export function readSelection(params) {
  const ids = [...new Set((params.get('ids') ?? '').split(','))]
  const mapping = Object.fromEntries(fields.flatMap(({ key }) => {
    const title = params.get(key)?.trim()
    return title ? [[key, title]] : []
  }))
  if (ids.some(id => !idPattern.test(id)) || !mapping.month || !mapping.year ||
      !amounts.some(({ key }) => mapping[key]) ||
      Object.values(mapping).some(title => title.length > 255 || !normalize(title))) {
    throw new ApiError(400, 'Selecione as planilhas e indique Mês, Ano e pelo menos uma coluna de valores.')
  }
  return { ids, mapping }
}

export function createSmartsheetClient({
  token = process.env.SMARTSHEET_ACCESS_TOKEN,
  workspaceId = process.env.SMARTSHEET_WORKSPACE_ID,
  request,
} = {}) {
  const dispatcher = request ? undefined : new EnvHttpProxyAgent()
  const send = request ?? ((url, options) => fetch(url, { ...options, dispatcher }))
  let catalogCache
  let catalogInFlight

  async function get(path, query = {}) {
    if (!token?.trim()) {
      throw new ApiError(503, 'Configure o segredo SMARTSHEET_ACCESS_TOKEN nas configurações do ambiente para conectar.')
    }
    const url = new URL(apiUrl + path)
    url.search = new URLSearchParams(query)
    let response
    try {
      response = await send(url, {
        headers: { Authorization: 'Bearer ' + token.trim(), Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new ApiError(502, 'Falha ao conectar à API do Smartsheet. Verifique o acesso de rede a api.smartsheet.com.')
    }
    if (!response.ok) await response.body?.cancel().catch(() => {})
    if (response.status === 401) {
      throw new ApiError(401, 'O Smartsheet recusou o token. Confira se ele está válido e atualizado nas configurações do ambiente.')
    }
    if (response.status === 403 || response.status === 404) {
      throw new ApiError(response.status, 'O Smartsheet não concedeu acesso a este recurso. Confira se o workspace e a planilha estão compartilhados com a conta do token.')
    }
    if (response.status === 429) {
      throw new ApiError(429, 'O Smartsheet limitou temporariamente as consultas.', retryDelay(response.headers.get('Retry-After')))
    }
    if (!response.ok) throw new ApiError(502, 'O Smartsheet não conseguiu atender à consulta. Tente novamente.')
    try {
      return JSON.parse(await response.text(), (key, value, context) => {
        // Keep the original digits of Smartsheet's integer IDs.
        if ((key === 'id' || key === 'columnId') && typeof value === 'number') return context.source
        return value
      })
    } catch {
      throw new ApiError(502, 'A API do Smartsheet devolveu uma resposta inválida.')
    }
  }

  async function* list(path, query) {
    let lastKey
    const seen = new Set()
    do {
      const page = await get(path, { ...query, maxItems: 100, ...(lastKey ? { lastKey } : {}) })
      if (!Array.isArray(page.data)) throw new ApiError(502, 'A lista do Smartsheet chegou em um formato inesperado.')
      yield* page.data
      lastKey = page.lastKey
      if (lastKey && seen.has(lastKey)) throw new ApiError(502, 'O Smartsheet repetiu uma página de resultados.')
      seen.add(lastKey)
    } while (lastKey)
  }

  async function resolveWorkspace() {
    const configuredId = workspaceId?.trim()
    if (configuredId) {
      if (!idPattern.test(configuredId)) throw new ApiError(503, 'SMARTSHEET_WORKSPACE_ID deve conter o ID numérico do workspace.')
      const workspace = await get('/workspaces/' + configuredId + '/metadata')
      return { id: configuredId, name: workspace.name }
    }
    const matchingNames = []
    for await (const workspace of list('/workspaces', { paginationType: 'token' })) {
      if (!idPattern.test(workspace.id)) continue
      if (matchesWorkspace(workspace.permalink)) return workspace
      if (workspace.name === workspaceName) matchingNames.push(workspace)
    }
    if (matchingNames.length === 1) return matchingNames[0]
    throw new ApiError(404, 'O workspace do link não apareceu para esta conta. Confira o compartilhamento. Se o link retornado pela API for diferente, configure o ID numérico em SMARTSHEET_WORKSPACE_ID.')
  }

  async function discoverSheets() {
    const workspace = await resolveWorkspace()
    const sheets = new Map()
    for await (const item of list('/workspaces/' + workspace.id + '/children', { childrenResourceTypes: 'sheets' })) {
      if (item.resourceType === 'sheet' && idPattern.test(item.id) && typeof item.name === 'string') {
        sheets.set(item.id, { id: item.id, name: item.name })
      }
    }
    return {
      workspace: workspace.name,
      sheets: [...sheets.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }
  }

  async function catalog(force = false) {
    if (!force && catalogCache?.until > Date.now()) return catalogCache.data
    if (!catalogInFlight) {
      catalogInFlight = discoverSheets()
        .then(data => {
          catalogCache = { data, until: Date.now() + 5 * 60 * 1000 }
          return data
        })
        .finally(() => { catalogInFlight = null })
    }
    return catalogInFlight
  }

  function resolveSheet(sheets, id) {
    const sheet = sheets.find(sheet => sheet.id === id)
    if (!sheet) throw new ApiError(404, 'Uma planilha selecionada não está na raiz do workspace. Confira as fontes do painel.')
    return sheet
  }

  async function readColumns(id) {
    const data = await get('/sheets/' + id + '/columns', { includeAll: true })
    if (!Array.isArray(data.data)) throw new ApiError(502, 'Não foi possível identificar as colunas da planilha.')
    return data.data
      .filter(column => idPattern.test(column.id) && typeof column.title === 'string')
      .map(({ id, title, primary }) => ({ id, title, primary: !!primary }))
  }

  async function columns(id) {
    const { sheets } = await catalog()
    const sheet = resolveSheet(sheets, id)
    return { name: sheet.name, columns: await readColumns(id) }
  }

  async function readSheet(sheet, mapping) {
    const available = await readColumns(sheet.id)
    const mappedFields = Object.entries(mapping).map(([key, title]) => {
      const exact = available.find(column => column.title === title)
      const equivalent = available.filter(column => normalize(column.title) === normalize(title))
      const column = exact ?? (equivalent.length === 1 ? equivalent[0] : null)
      if (!column) throw new ApiError(409, 'Na planilha ' + sheet.name + ', confira a coluna “' + title + '”.')
      return [key, column.id]
    })
    const columnIds = [...new Set(mappedFields.map(([, id]) => id))]
    const rows = []
    const rowIds = new Set()
    let version
    let total
    let received
    let page = 1
    do {
      const body = await get('/sheets/' + sheet.id, { columnIds: columnIds.join(','), page, pageSize })
      if (!Array.isArray(body.rows) || !Array.isArray(body.columns)) {
        throw new ApiError(502, 'O Smartsheet devolveu uma planilha em formato inesperado.')
      }
      if (page === 1) {
        version = body.version
        total = body.totalRowCount
        const existing = new Set(body.columns.map(column => column.id))
        if (columnIds.some(column => !existing.has(column))) {
          throw new ApiError(409, 'Uma coluna da fonte mudou ou foi removida. Confira a correspondência das colunas.')
        }
      } else if (body.version !== version || body.totalRowCount !== total) {
        throw new ApiError(409, 'A planilha mudou durante a leitura. A próxima atualização buscará a versão mais recente.')
      }
      received = body.rows.length
      for (const row of body.rows) {
        if (!idPattern.test(row.id) || rowIds.has(row.id) || !Array.isArray(row.cells)) {
          throw new ApiError(502, 'O Smartsheet devolveu linhas repetidas ou incompletas.')
        }
        rowIds.add(row.id)
        const cells = new Map(row.cells.map(cell => [cell.columnId, cell]))
        const values = Object.fromEntries(mappedFields.map(([key, column]) => [key, readCell(cells.get(column), key)]))
        rows.push({ id: sheet.id + ':' + row.id, ...values })
      }
      if (received === 0 && rows.length < total) throw new ApiError(502, 'A leitura da planilha terminou antes de trazer todas as linhas.')
      page++
    } while (Number.isInteger(total) ? rows.length < total : received === pageSize)
    return normalizeBalances(rows, sheet.name)
  }

  async function snapshot({ ids, mapping }) {
    const data = await catalog()
    const selected = ids.map(id => resolveSheet(data.sheets, id))
    const results = new Array(selected.length)
    let next = 0
    let failure
    await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
      while (!failure && next < selected.length) {
        const index = next++
        const sheet = selected[index]
        try {
          results[index] = await readSheet(sheet, mapping)
        } catch (error) {
          failure ??= error instanceof ApiError
            ? error
            : new ApiError(502, 'Não foi possível ler a planilha ' + sheet.name + '.')
        }
      }
    }))
    if (failure) throw failure
    return {
      name: data.workspace,
      sheets: selected.map(sheet => sheet.name),
      balances: results.flatMap(result => result.balances),
      skipped: results.reduce((total, result) => total + result.skipped, 0),
      invalid: results.reduce((total, result) => total + result.invalid, 0),
      duplicates: results.reduce((total, result) => total + result.duplicates, 0),
      updatedAt: new Date().toISOString(),
    }
  }

  return { catalog, columns, snapshot }
}
