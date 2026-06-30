import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus, Camera, PenLine, Receipt } from 'lucide-react'
import { db } from '../db/db'
import { monthRange } from '../db/repository'
import { formatBRL, formatDateBR } from '../lib/format'
import { CATEGORY_LABELS, PAYMENT_LABELS, type Expense } from '../types'
import AppShell from '../components/AppShell'

export default function Home() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getFullYear(), month0: now.getMonth() })
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

  const monthLabel = new Date(ym.year, ym.month0).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  function shift(delta: number) {
    const d = new Date(ym.year, ym.month0 + delta)
    setYm({ year: d.getFullYear(), month0: d.getMonth() })
  }

  return (
    <AppShell title="Despesas">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="icon-btn -ml-2.5" aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </button>
        <span className="font-medium capitalize">{monthLabel}</span>
        <button onClick={() => shift(1)} className="icon-btn -mr-2.5" aria-label="Próximo mês">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label="Corporativo" value={totals.corp} />
        <Stat label="Pessoal" value={totals.pess} />
      </div>
      <div className="mb-6 rounded-xl bg-[var(--surface-2)] p-4">
        <div className="text-xs text-[var(--text-muted)]">Total do mês · {totals.count} despesas</div>
        <div className="mt-0.5 text-2xl font-medium">{formatBRL(totals.total)}</div>
      </div>

      <ul className="space-y-2">
        {(expenses ?? []).map((e) => (
          <ExpenseRow key={e.id} expense={e} />
        ))}
        {expenses && expenses.length === 0 && (
          <li className="py-16 text-center text-sm text-[var(--text-muted)]">
            Nenhuma despesa neste mês.
          </li>
        )}
      </ul>

      <Link
        to="/nova"
        className="fixed bottom-20 right-4 z-20 flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-4 font-medium text-[var(--ink-contrast)] shadow-lg"
      >
        <Plus size={20} />
        Nova despesa
      </Link>
    </AppShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-medium">{formatBRL(value)}</div>
    </div>
  )
}

function ExpenseRow({ expense: e }: { expense: Expense }) {
  const Icon = e.photo ? Camera : e.source === 'recibo' ? PenLine : Receipt
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
        <Icon size={18} className="text-[var(--text-muted)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{e.vendor || CATEGORY_LABELS[e.category]}</div>
        <div className="text-xs text-[var(--text-muted)]">
          {formatDateBR(e.date)} · {CATEGORY_LABELS[e.category]} · {PAYMENT_LABELS[e.paymentType]}
        </div>
      </div>
      <div className="text-right font-medium">{formatBRL(e.amount)}</div>
    </li>
  )
}
