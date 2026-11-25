export const fields = [
  { key: 'month', label: 'Mês', required: true, aliases: ['mês', 'mes de referência', 'mês competência', 'competência'] },
  { key: 'year', label: 'Ano', required: true, aliases: ['ano', 'ano de referência', 'ano competência'] },
  { key: 'assets', label: 'Total ativo de custeio', aliases: ['total ativo custeio', 'total ativo de custeio'] },
  { key: 'suppliers', label: 'Fornecedores', aliases: ['fornecedores'] },
  { key: 'taxes', label: 'Obrigações tributárias', aliases: ['obrigações tributárias', 'obrig tributárias'] },
  { key: 'cash', label: 'Ativo em conta movimento', aliases: ['ativo cust conta mov', 'ativo custeio conta movimento', 'ativo em conta movimento'] },
  { key: 'investments', label: 'Aplicações financeiras', aliases: ['ativo custeio aplic financ', 'ativo cust aplic financ', 'aplicações financeiras'] },
  { key: 'loansMade', label: 'Empréstimos realizados', aliases: ['empréstimos realizados'] },
  { key: 'otherLiabilities', label: 'Outras obrigações', aliases: ['outras obrigações'] },
  { key: 'contingencies', label: 'Contingências cíveis', aliases: ['contingências cíveis'] },
  { key: 'loansContracted', label: 'Empréstimos contratados', aliases: ['empréstimos contratados'] },
  { key: 'personnel', label: 'Obrigações com pessoal', aliases: ['obrigações com pessoal', 'obrig com pessoal'] },
  { key: 'socialCharges', label: 'Encargos sociais a recolher', aliases: ['enc sociais a recolher', 'encargos sociais a recolher'] },
]

export const amounts = fields.filter(field => !field.required)
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function cellText(value) {
  return String(value ?? '').trim()
}

export function normalize(value) {
  return cellText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}%]+/gu, ' ')
    .trim()
}

export function formatCount(value) {
  return integer.format(value)
}

export function formatMoney(value, compact = false) {
  if (value == null) return '—'
  if (!compact || Math.abs(value) < 1000) return money.format(value)
  const scales = [[1e9, 'bi'], [1e6, 'mi'], [1e3, 'mil']]
  const [scale, unit] = scales.find(([threshold]) => Math.abs(value) >= threshold)
  return (value < 0 ? '−' : '') + 'R$ ' + decimal.format(Math.abs(value) / scale) + ' ' + unit
}

export function formatPeriod(period, short = false) {
  if (!period) return '—'
  const [year, month] = period.split('-')
  return months[Number(month) - 1] + '/' + (short ? year.slice(-2) : year)
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = cellText(value).replace(/R\$/gi, '').replace(/\s/g, '').replace('−', '-')
  if (/^\(.+\)$/.test(text)) text = '-' + text.slice(1, -1)
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) {
    text = text.replaceAll('.', '').replace(',', '.')
  } else if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/.test(text)) {
    text = text.replaceAll(',', '')
  } else {
    text = text.replace(',', '.')
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function parsePeriod(month, year) {
  const text = normalize(month)
  const yearText = cellText(year)
  if (!/^\d{4}$/.test(yearText) || Number(yearText) < 1900) return null
  const numeric = text.match(/^(?:[a-z]+ )?(0?[1-9]|1[0-2])$/)
  const monthIndex = numeric
    ? Number(numeric[1]) - 1
    : months.findIndex(label => label.toLowerCase() === text.slice(0, 3))
  return monthIndex < 0 ? null : yearText + '-' + String(monthIndex + 1).padStart(2, '0')
}

export function suggestColumns(headers) {
  const normalized = headers.map(normalize)
  return Object.fromEntries(fields.map(({ key, aliases }) => {
    for (const alias of aliases.map(normalize)) {
      const exact = normalized.indexOf(alias)
      if (exact >= 0) return [key, headers[exact]]
      // Accounting headers include the balance sheet account after the label.
      if (key !== 'month' && key !== 'year') {
        const withAccount = normalized.findIndex(header => header.startsWith(alias + ' '))
        if (withAccount >= 0) return [key, headers[withAccount]]
      }
    }
    return [key, '']
  }))
}

export function normalizeBalances(rows, unit) {
  const periods = new Map()
  const duplicates = new Set()
  let skipped = 0
  let invalid = 0
  for (const row of rows) {
    const values = Object.fromEntries(amounts.map(({ key }) => {
      const value = parseNumber(row[key])
      if (value == null && !['', '-', '–', '—'].includes(cellText(row[key]))) invalid++
      return [key, value]
    }))
    const hasInputs = amounts.some(({ key }) => key !== 'assets' && values[key] != null)
    // Future rows can contain a formula returning zero with the underlying inputs empty.
    if (!hasInputs && !values.assets) continue
    const period = parsePeriod(row.month, row.year)
    if (!period) {
      skipped++
      continue
    }
    if (periods.has(period)) duplicates.add(period)
    else periods.set(period, { id: row.id, unit, period, ...values })
  }
  return {
    balances: [...periods.values()].filter(row => !duplicates.has(row.period)),
    skipped,
    invalid,
    duplicates: duplicates.size,
  }
}

export function summarize(rows) {
  const totals = Object.fromEntries(amounts.map(({ key }) => [key, { total: null, count: 0 }]))
  for (const row of rows) {
    for (const { key } of amounts) {
      if (row[key] != null) {
        totals[key].total = (totals[key].total ?? 0) + row[key]
        totals[key].count++
      }
    }
  }
  return { count: rows.length, ...totals }
}

export function monthlyHistory(rows, through) {
  const groups = new Map()
  for (const row of rows) {
    if (row.period > through) continue
    const monthly = groups.get(row.period) ?? []
    monthly.push(row)
    groups.set(row.period, monthly)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-8)
    .map(([period, monthly]) => ({ period, ...summarize(monthly) }))
}
