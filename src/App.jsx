import React, { useMemo, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, Building2, ChartNoAxesCombined, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, Database, Info, LayoutGrid, Plug, ReceiptText, RefreshCw, Search, SlidersHorizontal,
  Table2, Truck, Wallet,
} from 'lucide-react'
import { TrendChart, UnitRanking } from './Charts.jsx'
import ConnectDialog from './ConnectDialog.jsx'
import Modal from './Modal.jsx'
import { workspaceUrl } from './config.js'
import { amounts, formatCount, formatMoney, formatPeriod, monthlyHistory, normalize, summarize } from './data.js'
import { demoSource } from './demo.js'
import { useSmartsheet } from './smartsheet.js'

const views = {
  overview: { title: 'Visão geral', description: 'Monitoramento financeiro dos Planos de Eficiência por unidade.', icon: LayoutGrid },
  balances: { title: 'Demonstrativos', description: 'Consulte os saldos das unidades por competência.', icon: Table2 },
  source: { title: 'Fonte de dados', description: 'Gerencie as planilhas que alimentam o painel.', icon: Database },
}
const syncTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
})
const pageSize = 12

function Sidebar({ view, onNavigate }) {
  return (
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => onNavigate('overview')}>
        <span className="brand-icon"><ChartNoAxesCombined size={24} aria-hidden="true" /></span>
        <span>Plano de<br className="brand-break" /> Eficiência</span>
      </button>
      <nav className="navigation" aria-label="Navegação principal">
        {Object.entries(views).map(([key, { title, icon: Icon }]) => (
          <button
            key={key}
            type="button"
            className={view === key ? 'nav-button active' : 'nav-button'}
            aria-current={view === key ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{title}</span>
          </button>
        ))}
      </nav>
      <a className="workspace-link" href={workspaceUrl} target="_blank" rel="noreferrer">
        <span className="workspace-icon"><Database size={17} aria-hidden="true" /></span>
        <span><strong>Smartsheet</strong><small>Monitoramento dos PEEs</small></span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </aside>
  )
}

function SourceBanner({ source, connected, syncing, error, onNavigate }) {
  if (!connected) {
    return (
      <div className="source-banner demo-banner" role="status">
        <Info size={19} aria-hidden="true" />
        <strong>Dados de demonstração</strong>
        <span>Conecte as planilhas do Smartsheet para consultar os saldos reais.</span>
      </div>
    )
  }
  const hasIssues = source?.invalid > 0 || source?.skipped > 0 || source?.duplicates > 0
  return (
    <div className={'source-banner ' + (error ? 'error-banner' : 'live-banner')} role="status">
      {error ? <CircleAlert size={19} aria-hidden="true" /> : <span className="live-dot" aria-hidden="true" />}
      <strong>{error ? 'Falha na atualização' : 'Smartsheet conectado'}</strong>
      <span>
        {source?.updatedAt
          ? (error ? 'Última leitura válida em ' : 'Atualizado em ') + syncTime.format(new Date(source.updatedAt))
          : (syncing ? 'Buscando dados das planilhas…' : 'Aguardando a primeira leitura.')}
      </span>
      {(error || hasIssues) && (
        <button className="text-button banner-action" type="button" onClick={() => onNavigate('source')}>
          {error ? 'Ver detalhes' : 'Conferir dados ausentes'}
        </button>
      )}
    </div>
  )
}

function FilterSelect({ label, value, children, onChange }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <div className="filter-select">
        <select value={value} onChange={event => onChange(event.target.value)}>{children}</select>
        <ChevronDown size={15} aria-hidden="true" />
      </div>
    </label>
  )
}

function Filters({ units, periods, unit, period, onUnit, onPeriod }) {
  return (
    <div className="filters" role="group" aria-label="Filtros do painel">
      <div className="filters-label"><SlidersHorizontal size={17} aria-hidden="true" /> Filtros</div>
      <FilterSelect label="Unidade" value={unit} onChange={onUnit}>
        <option value="">Todas as unidades</option>
        {units.map(name => <option value={name} key={name}>{name}</option>)}
      </FilterSelect>
      <FilterSelect label="Competência" value={period} onChange={onPeriod}>
        {periods.length === 0 && <option value="">Sem competência com dados</option>}
        {periods.map(month => <option value={month} key={month}>{formatPeriod(month)}</option>)}
      </FilterSelect>
      {unit && <button className="text-button clear-filters" type="button" onClick={() => onUnit('')}>Todas as unidades</button>}
    </div>
  )
}

function MetricCards({ summary, unitCount }) {
  const balances = [
    { key: 'assets', title: 'Ativo de custeio', icon: Wallet, tone: 'green' },
    { key: 'suppliers', title: 'Fornecedores', icon: Truck, tone: 'purple' },
    { key: 'taxes', title: 'Obrigações tributárias', icon: ReceiptText, tone: 'amber' },
  ].map(({ key, ...metric }) => ({
    ...metric,
    value: formatMoney(summary[key].total, true),
    fullValue: formatMoney(summary[key].total),
    description: summary[key].count
      ? 'Saldo informado por ' + formatCount(summary[key].count) + (summary[key].count === 1 ? ' unidade' : ' unidades')
      : 'Sem saldo informado',
  }))
  const metrics = [
    {
      title: 'Unidades com dados', value: formatCount(summary.count), icon: Building2, tone: 'blue',
      description: 'De ' + formatCount(unitCount) + (unitCount === 1 ? ' unidade selecionada' : ' unidades selecionadas'),
    },
    ...balances,
  ]
  return (
    <section className="metrics" aria-label="Indicadores financeiros">
      {metrics.map(({ title, value, fullValue, icon: Icon, tone, description }) => (
        <article className="panel metric" key={title}>
          <div className="metric-top">
            <h2>{title}</h2>
            <span className={'metric-icon ' + tone}><Icon size={19} strokeWidth={1.9} aria-hidden="true" /></span>
          </div>
          <strong className="metric-value" title={fullValue}>{value}</strong>
          <p>{description}</p>
        </article>
      ))}
    </section>
  )
}

const tableAmounts = [
  ['assets', 'Ativo de custeio'],
  ['suppliers', 'Fornecedores'],
  ['taxes', 'Obrig. tributárias'],
  ['personnel', 'Obrig. com pessoal'],
]

function BalancesTable({ rows, onDetails }) {
  if (!rows.length) return <div className="empty-table"><Search size={25} aria-hidden="true" />Nenhum demonstrativo neste recorte.</div>
  return (
    <div className="table-scroll" role="region" aria-label="Tabela de saldos por unidade" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Unidade</th>
            <th scope="col">Competência</th>
            {tableAmounts.map(([key, label]) => <th key={key} scope="col" className="align-right">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td><button type="button" className="unit-link" onClick={() => onDetails(row.id)}>{row.unit}</button></td>
              <td>{formatPeriod(row.period)}</td>
              {tableAmounts.map(([key]) => <td key={key} className="align-right money-cell">{formatMoney(row[key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Details({ row, onClose }) {
  return (
    <Modal title={row.unit} onClose={onClose}>
      <div className="modal-body">
        <p className="detail-period">Demonstrativo de {formatPeriod(row.period)}</p>
        <dl className="details-grid">
          {amounts.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{formatMoney(row[key])}</dd></div>)}
        </dl>
      </div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Fechar detalhes</button></div>
    </Modal>
  )
}

function SourcePage({ source, connection, onConfigure, onDisconnect }) {
  const connected = Boolean(connection.settings)
  return (
    <section className="panel source-panel" aria-labelledby="source-heading">
      <div className="source-card-header">
        <span className="source-icon"><Database size={23} aria-hidden="true" /></span>
        <div>
          <h2 id="source-heading">Smartsheet</h2>
          <p>Monitoramento dos PEEs</p>
        </div>
        <a className="button secondary" href={workspaceUrl} target="_blank" rel="noreferrer">
          Abrir workspace <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="source-card-body">
        {connection.error && (
          <div className="connection-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" /><span>{connection.error}</span>
          </div>
        )}
        {connected ? (
          <>
            <p>O painel consulta as planilhas selecionadas a cada 5 minutos enquanto está aberto.</p>
            <dl className="source-stats">
              <div><dt>Planilhas selecionadas</dt><dd>{formatCount(connection.settings.ids.length)}</dd></div>
              <div><dt>Demonstrativos lidos</dt><dd>{source ? formatCount(source.balances.length) : '—'}</dd></div>
              <div><dt>Última leitura válida</dt><dd>{source?.updatedAt ? syncTime.format(new Date(source.updatedAt)) : '—'}</dd></div>
            </dl>
            {source?.sheets.length > 0 && <ul className="source-units">{source.sheets.map((name, index) => <li key={name + ':' + index}>{name}</li>)}</ul>}
            {!!source?.skipped && <p>{formatCount(source.skipped)} linha(s) com saldo e competência inválida foram ignoradas.</p>}
            {!!source?.duplicates && <p>{formatCount(source.duplicates)} competência(s) duplicada(s) por unidade foram excluídas dos totais.</p>}
            {!!source?.invalid && <p>{formatCount(source.invalid)} saldo(s) inválido(s) foram tratados como ausentes.</p>}
          </>
        ) : (
          <>
            <p>Selecione as planilhas das unidades para consolidar os demonstrativos mensais.</p>
            <p>A conexão usa um token configurado no servidor. A conta do token precisa ter permissão de leitura das planilhas.</p>
          </>
        )}
      </div>
      <div className="source-card-actions">
        <button type="button" className="button primary" onClick={onConfigure}><Plug size={17} aria-hidden="true" />{connected ? 'Configurar planilhas' : 'Conectar Smartsheet'}</button>
        {connected && (
          <button type="button" className="button secondary" disabled={connection.syncing} onClick={connection.refresh}>
            <RefreshCw size={16} className={connection.syncing ? 'spin' : ''} aria-hidden="true" />
            {connection.syncing ? 'Atualizando…' : 'Atualizar agora'}
          </button>
        )}
        {connected && <button type="button" className="text-button disconnect" onClick={onDisconnect}>Desconectar</button>}
      </div>
    </section>
  )
}

export default function App() {
  const connection = useSmartsheet()
  const connected = Boolean(connection.settings)
  const source = connected ? connection.snapshot : demoSource
  const [view, setView] = useState('overview')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [configuring, setConfiguring] = useState(false)
  const [detailsId, setDetailsId] = useState('')
  const units = useMemo(() => [...new Set(source?.sheets ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [source])
  const unit = units.includes(selectedUnit) ? selectedUnit : ''
  const unitRows = useMemo(() => (source?.balances ?? []).filter(row => !unit || unit === row.unit), [source, unit])
  const periods = useMemo(() => [...new Set(unitRows.map(row => row.period))].sort().reverse(), [unitRows])
  const period = periods.includes(selectedPeriod) ? selectedPeriod : periods[0] ?? ''
  const monthlyRows = useMemo(() => unitRows.filter(row => row.period === period).sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR')), [unitRows, period])
  const summary = useMemo(() => summarize(monthlyRows), [monthlyRows])
  const history = useMemo(() => monthlyHistory(unitRows, period), [unitRows, period])
  const rows = monthlyRows.filter(row => view !== 'balances' || normalize(row.unit).includes(normalize(search)))
  const numberOfPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, numberOfPages)
  const start = (currentPage - 1) * pageSize
  const detail = detailsId && source?.balances.find(row => row.id === detailsId)

  function navigate(next) {
    setView(next)
    setPage(1)
    window.scrollTo(0, 0)
  }

  function setUnit(value) {
    setSelectedUnit(value)
    setPage(1)
  }

  function setPeriod(value) {
    setSelectedPeriod(value)
    setPage(1)
  }

  function resetView() {
    setUnit('')
    setPeriod('')
    setSearch('')
    setDetailsId('')
  }

  function applyConnection(settings, data) {
    connection.connect(settings, data)
    resetView()
    setConfiguring(false)
    navigate('overview')
  }

  function disconnect() {
    connection.disconnect()
    resetView()
  }

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <Sidebar view={view} onNavigate={navigate} />
      <main id="main-content" className="main">
        <div className="content">
          <header className="page-header">
            <div>
              <h1>{views[view].title}</h1>
              <p>{views[view].description}</p>
            </div>
            {view !== 'source' && (
              connected ? (
                <button type="button" className="button primary" disabled={connection.syncing} onClick={connection.refresh}>
                  <RefreshCw size={17} className={connection.syncing ? 'spin' : ''} aria-hidden="true" />
                  {connection.syncing ? 'Atualizando…' : 'Atualizar dados'}
                </button>
              ) : (
                <button type="button" className="button primary" onClick={() => setConfiguring(true)}>
                  <Plug size={17} aria-hidden="true" />Conectar Smartsheet
                </button>
              )
            )}
          </header>

          {view === 'source' ? (
            <SourcePage source={source} connection={connection} onConfigure={() => setConfiguring(true)} onDisconnect={disconnect} />
          ) : (
            <>
              <SourceBanner source={source} connected={connected} syncing={connection.syncing} error={connection.error} onNavigate={navigate} />
              {source ? (
                <>
                  <Filters units={units} periods={periods} unit={unit} period={period} onUnit={setUnit} onPeriod={setPeriod} />
                  {view === 'overview' ? (
                    <>
                      <MetricCards summary={summary} unitCount={unit ? 1 : units.length} />
                      <div className="charts">
                        <TrendChart history={history} period={period} onSelect={setPeriod} />
                        <UnitRanking rows={monthlyRows} selected={unit} onSelect={name => setUnit(unit === name ? '' : name)} />
                      </div>
                      <section className="panel table-panel" aria-labelledby="preview-heading">
                        <div className="panel-heading table-heading">
                          <div><h2 id="preview-heading">Posição por unidade</h2><p>Competência {formatPeriod(period)}</p></div>
                          <button type="button" className="button secondary" onClick={() => { setSearch(''); navigate('balances') }}>
                            Ver demonstrativos <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        </div>
                        <BalancesTable rows={rows.slice(0, 5)} onDetails={setDetailsId} />
                      </section>
                    </>
                  ) : (
                    <section className="panel table-panel" aria-label="Lista de demonstrativos">
                      <div className="panel-heading table-heading search-heading">
                        <label className="search-field">
                          <Search size={18} aria-hidden="true" />
                          <input
                            type="search"
                            aria-label="Buscar unidade"
                            placeholder="Buscar unidade"
                            value={search}
                            onChange={event => { setSearch(event.target.value); setPage(1) }}
                          />
                        </label>
                        <span className="result-count">{formatCount(rows.length)} {rows.length === 1 ? 'unidade' : 'unidades'}</span>
                      </div>
                      <BalancesTable rows={rows.slice(start, start + pageSize)} onDetails={setDetailsId} />
                      {rows.length > pageSize && (
                        <div className="pagination" aria-label="Paginação dos demonstrativos">
                          <span>{formatCount(start + 1)}–{formatCount(Math.min(start + pageSize, rows.length))} de {formatCount(rows.length)}</span>
                          <button type="button" className="icon-button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                            <ChevronLeft size={18} aria-hidden="true" />
                          </button>
                          <button type="button" className="icon-button" aria-label="Próxima página" disabled={currentPage >= numberOfPages} onClick={() => setPage(currentPage + 1)}>
                            <ChevronRight size={18} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <div className="panel empty-table" role="status">
                  <Database size={26} aria-hidden="true" />
                  {connection.syncing ? 'Carregando os demonstrativos…' : 'Os dados do Smartsheet ainda estão indisponíveis.'}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {configuring && <ConnectDialog settings={connection.settings} onConnect={applyConnection} onClose={() => setConfiguring(false)} />}
      {detail && <Details row={detail} onClose={() => setDetailsId('')} />}
    </div>
  )
}
