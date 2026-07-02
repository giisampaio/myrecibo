import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, CloudUpload, RefreshCw } from 'lucide-react'
import { db } from '../db/db'
import { isSupabaseEnabled } from '../lib/supabase'
import { syncNow, onSyncState } from '../lib/sync'

/**
 * Indicador de backup na nuvem: ✓ tudo sincronizado, n pendentes, ou offline.
 * Toque força um ciclo de sincronização.
 */
export default function SyncBadge() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const pending = useLiveQuery(() => db.expenses.where('sync').equals('local').count(), [], 0)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    const unsub = onSyncState(setSyncing)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      unsub()
    }
  }, [])

  if (!isSupabaseEnabled) return null

  const state = syncing ? 'sync' : !online ? 'offline' : pending > 0 ? 'pendente' : 'ok'
  const label =
    state === 'sync'
      ? 'Sincronizando…'
      : state === 'offline'
        ? 'Offline — sincroniza quando voltar a internet'
        : state === 'pendente'
          ? `${pending} despesa(s) aguardando backup`
          : 'Backup em dia'

  return (
    <button
      onClick={() => void syncNow()}
      aria-label={label}
      title={label}
      className="icon-btn relative"
    >
      {state === 'sync' && (
        <RefreshCw size={20} className="animate-spin text-[var(--text-muted)]" />
      )}
      {state === 'offline' && <CloudOff size={20} className="text-[var(--text-muted)]" />}
      {state === 'pendente' && (
        <>
          <CloudUpload size={20} style={{ color: 'var(--status-pendente)' }} />
          <span
            className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
            style={{ backgroundColor: 'var(--status-pendente)', color: '#fff' }}
          >
            {pending > 99 ? '99' : pending}
          </span>
        </>
      )}
      {state === 'ok' && <Cloud size={20} className="text-[var(--text-muted)]" />}
    </button>
  )
}
