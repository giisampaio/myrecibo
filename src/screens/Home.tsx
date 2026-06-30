import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
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
    const corp = list
      .filter((e) => e.paymentType === 'corporativo')
      .reduce((s, e) => s + e.amount, 0)
    const pess = list
      .filter((e) => e.paymentType === 'pessoal')
      .reduce((s, e) => s + e.amount, 0)
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
    <AppShell title="MyRecibo">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="px-2 text-slate-400">
          ‹
        </button>
        <span className="font-medium capitalize text-slate-200">{monthLabel}</span>
        <button onClick={() => shift(1)} className="px-2 text-slate-400">
          ›
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card label="Corporativo" value={totals.corp} accent="text-sky-400" />
        <Card label="Pessoal (reembolso)" value={totals.pess} accent="text-amber-400" />
      </div>
      <div className="mb-6 rounded-xl bg-slate-800/60 p-4">
        <div className="text-xs text-slate-400">Total do mês ({totals.count} despesas)</div>
        <div className="text-2xl font-bold text-white">{formatBRL(totals.total)}</div>
      </div>

      <ul className="space-y-2">
        {(expenses ?? []).map((e) => (
          <ExpenseRow key={e.id} expense={e} />
        ))}
        {expenses && expenses.length === 0 && (
          <li className="py-12 text-center text-slate-500">
            Nenhuma despesa neste mês.
            <br />
            Toque em <span className="text-sky-400">+ Nova despesa</span>.
          </li>
        )}
      </ul>

      <Link
        to="/nova"
        className="fixed bottom-20 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-sky-500 px-6 text-base font-semibold text-white shadow-lg shadow-sky-500/30 active:bg-sky-600"
      >
        + Nova despesa
      </Link>
    </AppShell>
  )
}

function Card({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-800/60 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{formatBRL(value)}</div>
    </div>
  )
}

function ExpenseRow({ expense: e }: { expense: Expense }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-slate-800/40 p-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg ${
          e.paymentType === 'corporativo' ? 'bg-sky-500/20' : 'bg-amber-500/20'
        }`}
      >
        {e.photo ? '📷' : e.source === 'recibo' ? '✍️' : '🧾'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-100">
          {e.vendor || CATEGORY_LABELS[e.category]}
        </div>
        <div className="text-xs text-slate-400">
          {formatDateBR(e.date)} · {CATEGORY_LABELS[e.category]} · {PAYMENT_LABELS[e.paymentType]}
          {e.sync === 'local' && <span className="ml-1 text-slate-500">• não sincronizado</span>}
        </div>
      </div>
      <div className="text-right font-semibold text-slate-100">{formatBRL(e.amount)}</div>
    </li>
  )
}
