import { useEffect, useRef, useState } from 'react'
import { refreshInterval } from './config.js'
import { amounts, fields } from './data.js'

const api = '/api/smartsheet/sheets'
const storageKey = 'plano-de-eficiencia.smartsheet.balances'

async function getJson(url, signal) {
  let response
  try {
    response = await fetch(url, { signal, cache: 'no-store' })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('O servidor do painel está indisponível. Tente novamente.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) {
    const error = new Error(body?.message || 'O servidor não retornou os dados do Smartsheet.')
    error.retryAfter = Number(response.headers.get('Retry-After')) || 0
    throw error
  }
  return body
}

export function getCatalog(signal) {
  return getJson(api, signal)
}

export function getColumns(sheetId, signal) {
  return getJson(api + '/' + encodeURIComponent(sheetId) + '/columns', signal)
}

export function getSnapshot({ ids, mapping }, signal) {
  const query = new URLSearchParams({ ...mapping, ids: ids.join(',') })
  return getJson('/api/smartsheet/snapshot?' + query, signal)
}

function restoreSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey))
    const id = /^[1-9]\d{0,18}$/
    if (!Array.isArray(stored?.ids) || !stored.ids.length ||
        !stored.ids.every(value => id.test(value)) || !stored.mapping) return null
    const mapping = Object.fromEntries(fields.flatMap(({ key }) =>
      typeof stored.mapping[key] === 'string' ? [[key, stored.mapping[key]]] : [],
    ))
    if (!mapping.month || !mapping.year || !amounts.some(({ key }) => mapping[key])) return null
    return { ids: stored.ids, mapping }
  } catch {
    return null
  }
}

export function useSmartsheet() {
  const [settings, setSettings] = useState(restoreSettings)
  const [snapshot, setSnapshot] = useState(null)
  const [syncing, setSyncing] = useState(Boolean(settings))
  const [error, setError] = useState('')
  const [refreshRequest, setRefreshRequest] = useState(0)
  const nextSync = useRef(0)
  const retryUntil = useRef(0)

  useEffect(() => {
    if (!settings) return
    const request = new AbortController()
    let timer

    async function sync() {
      setSyncing(true)
      setError('')
      let delay = refreshInterval
      try {
        const result = await getSnapshot(settings, request.signal)
        if (!request.signal.aborted) setSnapshot(result)
      } catch (failure) {
        if (!request.signal.aborted) {
          setError(failure.message)
          if (failure.retryAfter > 0) {
            retryUntil.current = Date.now() + failure.retryAfter * 1000
            delay = Math.max(delay, failure.retryAfter * 1000)
          }
        }
      } finally {
        if (!request.signal.aborted) {
          setSyncing(false)
          timer = setTimeout(sync, delay)
        }
      }
    }

    timer = setTimeout(sync, Math.max(0, nextSync.current - Date.now(), retryUntil.current - Date.now()))
    return () => {
      request.abort()
      clearTimeout(timer)
    }
  }, [settings, refreshRequest])

  function connect(nextSettings, nextSnapshot) {
    nextSync.current = Date.now() + refreshInterval
    retryUntil.current = 0
    setSnapshot(nextSnapshot)
    setError('')
    setSyncing(false)
    setSettings(nextSettings)
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextSettings))
    } catch {
      // The open session continues to sync if storage is unavailable.
    }
  }

  function disconnect() {
    setSettings(null)
    setSnapshot(null)
    setSyncing(false)
    setError('')
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Storage may be disabled.
    }
  }

  function refresh() {
    const waiting = retryUntil.current - Date.now()
    if (waiting > 0) {
      setError('O Smartsheet limitou temporariamente as consultas. A atualização será retomada automaticamente.')
      return
    }
    setSyncing(true)
    nextSync.current = 0
    setRefreshRequest(current => current + 1)
  }

  return { settings, snapshot, syncing, error, connect, disconnect, refresh }
}
