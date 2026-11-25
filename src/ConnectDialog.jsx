import React, { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, CircleAlert, Database, RefreshCw } from 'lucide-react'
import Modal from './Modal.jsx'
import { amounts, fields, formatCount, suggestColumns } from './data.js'
import { getCatalog, getColumns, getSnapshot } from './smartsheet.js'
import { workspaceUrl } from './config.js'

export default function ConnectDialog({ settings, onClose, onConnect }) {
  const [catalog, setCatalog] = useState(null)
  const [selected, setSelected] = useState([])
  const [columnSet, setColumnSet] = useState(null)
  const [mapping, setMapping] = useState(settings?.mapping ?? {})
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const applyRequest = useRef(null)
  const referenceId = selected[0]
  const columns = columnSet?.id === referenceId ? columnSet?.columns : null
  const canConnect = columns && mapping.month && mapping.year && amounts.some(({ key }) => mapping[key])

  useEffect(() => {
    const request = new AbortController()
    getCatalog(request.signal).then(result => {
      if (request.signal.aborted) return
      setCatalog(result)
      setSelected(result.sheets.map(sheet => sheet.id).filter(id => !settings || settings.ids.includes(id)))
    }).catch(failure => {
      if (!request.signal.aborted) setError(failure.message)
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false)
    })
    return () => request.abort()
  }, [settings, retry])

  useEffect(() => {
    if (!referenceId) return
    const request = new AbortController()
    getColumns(referenceId, request.signal).then(({ columns: available }) => {
      if (request.signal.aborted) return
      const suggested = suggestColumns(available.map(column => column.title))
      setColumnSet({ id: referenceId, columns: available })
      setMapping(current => Object.fromEntries(fields.map(({ key }) => {
        if (current[key] != null && (!current[key] || available.some(column => column.title === current[key]))) {
          return [key, current[key]]
        }
        return [key, suggested[key]]
      })))
    }).catch(failure => {
      if (!request.signal.aborted) setError(failure.message)
    })
    return () => request.abort()
  }, [referenceId, retry])

  useEffect(() => () => applyRequest.current?.abort(), [])

  async function connect() {
    if (!canConnect || applying) return
    setApplying(true)
    setError('')
    const request = new AbortController()
    applyRequest.current = request
    const next = { ids: selected, mapping }
    try {
      const data = await getSnapshot(next, request.signal)
      if (!request.signal.aborted) onConnect(next, data)
    } catch (failure) {
      if (!request.signal.aborted) setError(failure.message)
    } finally {
      if (!request.signal.aborted) setApplying(false)
    }
  }

  function mappingFields(entries) {
    return entries.map(({ key, label, required }) => (
      <label className="form-field" key={key}>
        {label}
        <select
          value={mapping[key]}
          disabled={applying}
          onChange={event => setMapping(current => ({ ...current, [key]: event.target.value }))}
        >
          <option value="">{required ? 'Selecione a coluna' : 'Sem coluna'}</option>
          {columns.map(column => <option key={column.id} value={column.title}>{column.title}</option>)}
        </select>
      </label>
    ))
  }

  return (
    <Modal title="Conectar Smartsheet" onClose={onClose} wide>
      <div className="modal-body">
        <div className="connection-source">
          <span className="source-icon"><Database size={22} aria-hidden="true" /></span>
          <div>
            <strong>{catalog?.workspace ?? 'Workspace do Smartsheet'}</strong>
            <a href={workspaceUrl} target="_blank" rel="noreferrer">
              Abrir workspace <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
        {loading && <p className="connection-loading" role="status">Consultando as planilhas disponíveis…</p>}
        {catalog?.sheets.length === 0 && <p className="connection-loading">O workspace não tem planilhas disponíveis para esta conta.</p>}
        {catalog?.sheets.length > 0 && (
          <fieldset className="sheet-picker" disabled={applying}>
            <legend>Planilhas das unidades</legend>
            <div className="sheet-picker-actions">
              <span>{formatCount(selected.length)} de {formatCount(catalog.sheets.length)} selecionadas</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError('')
                  setSelected(selected.length === catalog.sheets.length ? [] : catalog.sheets.map(sheet => sheet.id))
                }}
              >
                {selected.length === catalog.sheets.length ? 'Limpar seleção' : 'Selecionar todas'}
              </button>
            </div>
            <div className="sheet-options">
              {catalog.sheets.map(sheet => (
                <label key={sheet.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(sheet.id)}
                    onChange={event => {
                      const ids = new Set(selected)
                      if (event.target.checked) ids.add(sheet.id)
                      else ids.delete(sheet.id)
                      setError('')
                      setSelected(catalog.sheets.map(sheet => sheet.id).filter(id => ids.has(id)))
                    }}
                  />
                  {sheet.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {referenceId && !columns && !error && <p className="connection-loading" role="status">Consultando as colunas…</p>}
        {columns && (
          <>
            <div className="mapping-heading">
              <h3>Correspondência das colunas</h3>
              <p>Confirme Mês, Ano e os valores. O painel usa os mesmos cabeçalhos nas planilhas selecionadas.</p>
            </div>
            <div className="column-mapping">{mappingFields(fields.slice(0, 5))}</div>
            <details className="extra-mapping">
              <summary>Demais contas do demonstrativo</summary>
              <div className="column-mapping">{mappingFields(fields.slice(5))}</div>
            </details>
          </>
        )}
        {error && (
          <div className="connection-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{error}</span>
            {!columns && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setLoading(true)
                  setError('')
                  setRetry(current => current + 1)
                }}
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <span>Somente leitura · Atualização a cada 5 minutos</span>
        <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="button primary" disabled={!canConnect || applying} onClick={connect}>
          {applying && <RefreshCw size={15} className="spin" aria-hidden="true" />}
          {applying ? 'Carregando dados…' : 'Conectar fonte'}
        </button>
      </div>
    </Modal>
  )
}
