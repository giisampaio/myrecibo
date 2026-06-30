import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { monthRange } from '../db/repository'
import { exportReceiptsPDF, exportXLSX } from '../lib/exporters'
import { formatBRL } from '../lib/format'
import AppShell from '../components/AppShell'

export default function Relatorio() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const [start, end] = useMemo(() => monthRange(ym.year, ym.month0), [ym])
  const [busy, setBusy] = useState<string | null>(null)

  const expenses = useLiveQuery(
    () =>
      db.expenses
        .where('date')
        .between(start, end, true, false)
        .filter((e) => !e.deleted)
        .sortBy('date'),
    [start, end],
  )

  const monthLabel = new Date(ym.year, ym.month0).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  const list = expenses ?? []
  const total = list.reduce((s, e) => s + e.amount, 0)
  const comComprovante = list.filter((e) => e.photo).length

  function shift(delta: number) {
    const d = new Date(ym.year, ym.month0 + delta)
    setYm({ year: d.getFullYear(), month0: d.getMonth() })
  }

  async function onPdf() {
    setBusy('pdf')
    try {
      await exportReceiptsPDF(list, monthLabel)
    } finally {
      setBusy(null)
    }
  }

  function onXlsx() {
    setBusy('xlsx')
    try {
      exportXLSX(list, monthLabel)
    } finally {
      setBusy(null)
    }
  }

  return (
    <AppShell title="Relatório">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="px-2 text-slate-400">
          ‹
        </button>
        <span className="font-medium capitalize text-slate-200">{monthLabel}</span>
        <button onClick={() => shift(1)} className="px-2 text-slate-400">
          ›
        </button>
      </div>

      <div className="mb-6 rounded-xl bg-slate-800/60 p-4">
        <div className="text-xs text-slate-400">{list.length} despesas · {comComprovante} com foto</div>
        <div className="text-2xl font-bold text-white">{formatBRL(total)}</div>
      </div>

      <button
        onClick={onPdf}
        disabled={busy !== null || list.length === 0}
        className="mb-3 flex w-full items-center justify-between rounded-xl bg-slate-800/60 p-4 text-left active:bg-slate-800 disabled:opacity-50"
      >
        <div>
          <div className="font-semibold text-white">📄 PDF dos comprovantes</div>
          <div className="text-xs text-slate-400">Resumo + uma página por foto</div>
        </div>
        <span className="text-sky-400">{busy === 'pdf' ? 'Gerando…' : 'Gerar'}</span>
      </button>

      <button
        onClick={onXlsx}
        disabled={busy !== null || list.length === 0}
        className="flex w-full items-center justify-between rounded-xl bg-slate-800/60 p-4 text-left active:bg-slate-800 disabled:opacity-50"
      >
        <div>
          <div className="font-semibold text-white">📊 Planilha (Excel)</div>
          <div className="text-xs text-slate-400">Modelo do financeiro</div>
        </div>
        <span className="text-sky-400">{busy === 'xlsx' ? 'Gerando…' : 'Gerar'}</span>
      </button>

      {list.length === 0 && (
        <p className="mt-8 text-center text-slate-500">Sem despesas neste mês.</p>
      )}
    </AppShell>
  )
}
