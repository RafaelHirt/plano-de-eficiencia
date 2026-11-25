import React from 'react'
import { ChartNoAxesCombined } from 'lucide-react'
import { formatCount, formatMoney, formatPeriod } from './data.js'

function plotScale(values) {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const interval = Math.max((max - min) / 4, 0.25)
  const magnitude = 10 ** Math.floor(Math.log10(interval))
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value >= interval)
  const start = Math.floor(min / step) * step
  const end = max === min ? 1 : Math.ceil(max / step) * step
  const position = value => (value - start) / (end - start) * 100
  const ticks = Array.from({ length: Math.round((end - start) / step) + 1 }, (_, index) => start + index * step)
  return { position, ticks }
}

function EmptyChart({ children }) {
  return <div className="empty-chart"><ChartNoAxesCombined size={26} aria-hidden="true" /><p>{children}</p></div>
}

export function TrendChart({ history, period, onSelect }) {
  const hasValues = history.some(month => month.assets.total != null || month.suppliers.total != null)
  const { position, ticks } = plotScale(history.flatMap(month => [month.assets.total ?? 0, month.suppliers.total ?? 0]))
  const zero = position(0)
  return (
    <section className="panel chart-panel" aria-labelledby="trend-heading">
      <div className="panel-heading chart-heading">
        <div>
          <h2 id="trend-heading">Evolução mensal</h2>
          <p>Saldos informados por competência</p>
        </div>
        <div className="chart-legend" aria-label="Legenda">
          <span><i className="legend-key assets" />Ativo de custeio</span>
          <span><i className="legend-key suppliers" />Fornecedores</span>
        </div>
      </div>
      {hasValues ? (
        <div className="trend-chart">
          <div className="trend-axis" aria-hidden="true">
            {ticks.map(value => (
              <span key={value} style={{ bottom: position(value) + '%' }}>{formatMoney(value, true).replace(/,00$/, '')}</span>
            ))}
          </div>
          <div
            className="trend-groups"
            style={{ gridTemplateColumns: 'repeat(' + history.length + ', minmax(0, 1fr))' }}
          >
            <div className="trend-grid" aria-hidden="true">
              {ticks.map(value => <i key={value} style={{ bottom: position(value) + '%' }} />)}
            </div>
            {history.map(month => {
              const description = [
                formatPeriod(month.period),
                'Ativo de custeio ' + formatMoney(month.assets.total) + ' em ' + formatCount(month.assets.count) + ' unidade(s)',
                'Fornecedores ' + formatMoney(month.suppliers.total) + ' em ' + formatCount(month.suppliers.count) + ' unidade(s)',
              ].join(' · ')
              return (
                <button
                  className="trend-group"
                  type="button"
                  key={month.period}
                  title={description}
                  aria-label={description}
                  aria-pressed={month.period === period}
                  onClick={() => onSelect(month.period)}
                >
                  <span className="trend-columns" aria-hidden="true">
                    {['assets', 'suppliers'].map(key => {
                      const value = month[key].total
                      return (
                        <span className="trend-slot" key={key}>
                          {value != null && (
                            <i
                              className={'trend-bar ' + key}
                              style={{ bottom: Math.min(zero, position(value)) + '%', height: Math.abs(position(value) - zero) + '%' }}
                            />
                          )}
                        </span>
                      )
                    })}
                  </span>
                  <span className="trend-label" aria-hidden="true">{formatPeriod(month.period, true)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : <EmptyChart>Sem saldos de ativo ou fornecedores neste recorte.</EmptyChart>}
    </section>
  )
}

export function UnitRanking({ rows, selected, onSelect }) {
  const ranked = rows.filter(row => row.assets != null).sort((a, b) => b.assets - a.assets)
  const displayed = ranked.slice(0, 5)
  const scale = Math.max(1, ...displayed.map(row => Math.abs(row.assets)))
  return (
    <section className="panel chart-panel rank-panel" aria-labelledby="rank-heading">
      <div className="panel-heading">
        <h2 id="rank-heading">Ativo por unidade</h2>
        <p>Saldo de custeio na competência selecionada</p>
      </div>
      {ranked.length ? (
        <>
          <ul className="unit-ranking">
            {displayed.map(({ id, unit, assets }) => (
              <li key={id}>
                <button type="button" onClick={() => onSelect(unit)} aria-pressed={selected === unit} title={unit + ' · ' + formatMoney(assets)}>
                  <span className="rank-unit">{unit}</span>
                  <strong>{formatMoney(assets, true)}</strong>
                  <span className="rank-track" aria-hidden="true"><i className={assets < 0 ? 'negative' : ''} style={{ width: Math.abs(assets) / scale * 100 + '%' }} /></span>
                </button>
              </li>
            ))}
          </ul>
          {ranked.length > displayed.length && <p className="chart-note">Os 5 maiores saldos. Consulte todas as unidades nos demonstrativos.</p>}
        </>
      ) : <EmptyChart>Sem valores de ativo de custeio neste recorte.</EmptyChart>}
    </section>
  )
}
