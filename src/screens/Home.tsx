import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Camera, PenLine, Search, ImageOff, X } from 'lucide-react'
import { db } from '../db/db'
import { monthRange } from '../db/repository'
import { formatBRL, formatDateBR } from '../lib/format'
import { CATEGORY_LABELS, PAYMENT_LABELS, type Expense } from '../types'
import AppShell from '../components/AppShell'
import MonthNav from '../components/MonthNav'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import SyncBadge from '../components/SyncBadge'

type Filter = 'todas' | 'corporativo' | 'pessoal' | 'sem-foto'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'corporativo', label: 'Corporativo' },
  { key: 'pessoal', label: 'Pessoal' },
  { key: 'sem-foto', label: 'Sem foto' },
]

export default function Home() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todas')
  const [start, end] = useMemo(() => monthRange(ym.year, ym.month0), [ym])

  const expenses = useLiveQuery(
    () =>
      db.expenses
        .where('date')
        .between(start, end, true, false)
        .filter((e) => !e.deleted)
        .reverse()
        .sortBy('date'),
    [start, end],
  )

  const totals = useMemo(() => {
    const list = expenses ?? []
    const corp = list.filter((e) => e.paymentType === 'corporativo').reduce((s, e) => s + e.amount, 0)
    const pess = list.filter((e) => e.paymentType === 'pessoal').reduce((s, e) => s + e.amount, 0)
    return { corp, pess, total: corp + pess, count: list.length }
  }, [expenses])

  const visible = useMemo(() => {
    let list = expenses ?? []
    if (filter === 'corporativo' || filter === 'pessoal')
      list = list.filter((e) => e.paymentType === filter)
    if (filter === 'sem-foto') list = list.filter((e) => !e.photo)
    const q = query.trim().toLowerCase()
    if (q)
      list = list.filter(
        (e) =>
          e.vendor.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          CATEGORY_LABELS[e.category].toLowerCase().includes(q),
      )
    return list
  }, [expenses, filter, query])

  const monthLabel = new Date(ym.year, ym.month0).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  function shift(delta: number) {
    const d = new Date(ym.year, ym.month0 + delta)
    setYm({ year: d.getFullYear(), month0: d.getMonth() })
  }

  const filtering = query.trim() !== '' || filter !== 'todas'

  return (
    <AppShell title="Despesas" action={<SyncBadge />}>
      <MonthNav label={monthLabel} onPrev={() => shift(-1)} onNext={() => shift(1)} />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <StatCard label="Corporativo" value={formatBRL(totals.corp)} />
        <StatCard label="Pessoal" value={formatBRL(totals.pess)} />
      </div>
      <div className="mb-5">
        <StatCard
          big
          label={`Total do mês · ${totals.count} despesa${totals.count === 1 ? '' : 's'}`}
          value={formatBRL(totals.total)}
        />
      </div>

      {/* Busca + filtros */}
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
        <Search size={18} className="shrink-0 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar estabelecimento, categoria…"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
        />
        {query && (
          <button onClick={() => setQuery('')} className="icon-btn -mr-2" aria-label="Limpar busca">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="press shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: active ? 'var(--ink)' : 'var(--border)',
                backgroundColor: active ? 'var(--surface-2)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <ul className="space-y-2">
        {visible.map((e) => (
          <ExpenseRow key={e.id} expense={e} />
        ))}
        {expenses && visible.length === 0 && (
          <li className="py-16 text-center text-sm text-[var(--text-muted)]">
            {filtering ? 'Nada encontrado com esse filtro.' : 'Nenhuma despesa neste mês.'}
          </li>
        )}
      </ul>

      {/* Espaço para a última despesa não ficar atrás do botão flutuante */}
      <div aria-hidden className="h-16" />

      <Link
        to="/"
        className="press fixed bottom-20 right-4 z-20 flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-4 font-medium text-[var(--ink-contrast)] shadow-lg"
      >
        <Plus size={20} />
        Nova despesa
      </Link>
    </AppShell>
  )
}

function ExpenseRow({ expense: e }: { expense: Expense }) {
  const noPhoto = !e.photo
  const Icon = noPhoto ? ImageOff : e.source === 'recibo' ? PenLine : Camera
  return (
    <li>
      <Link
        to={`/despesa/${e.id}`}
        className="press flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
          <Icon
            size={18}
            className={noPhoto ? 'text-[var(--status-pendente)]' : 'text-[var(--text-muted)]'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{e.vendor || CATEGORY_LABELS[e.category]}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">
            {e.vendor
              ? `${formatDateBR(e.date)} · ${CATEGORY_LABELS[e.category]} · ${PAYMENT_LABELS[e.paymentType]}`
              : `${formatDateBR(e.date)} · ${PAYMENT_LABELS[e.paymentType]}`}
            {noPhoto && <span className="text-[var(--status-pendente)]"> · sem comprovante</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-medium">{formatBRL(e.amount)}</span>
          {e.paymentType === 'pessoal' && <StatusBadge status={e.reimbursement} />}
        </div>
      </Link>
    </li>
  )
}
