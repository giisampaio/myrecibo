import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, FileText, Table } from 'lucide-react'
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
      <div className="mb-5 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="p-1 text-[var(--text-muted)]" aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </button>
        <span className="font-medium capitalize">{monthLabel}</span>
        <button onClick={() => shift(1)} className="p-1 text-[var(--text-muted)]" aria-label="Próximo mês">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mb-6 rounded-xl bg-[var(--surface-2)] p-4">
        <div className="text-xs text-[var(--text-muted)]">
          {list.length} despesas · {comComprovante} com foto
        </div>
        <div className="mt-0.5 text-2xl font-medium">{formatBRL(total)}</div>
      </div>

      <ExportRow
        Icon={FileText}
        title="PDF dos comprovantes"
        subtitle="Resumo + uma página por foto"
        state={busy === 'pdf' ? 'Gerando…' : 'Gerar'}
        disabled={busy !== null || list.length === 0}
        onClick={onPdf}
      />
      <ExportRow
        Icon={Table}
        title="Planilha (Excel)"
        subtitle="Modelo do financeiro"
        state={busy === 'xlsx' ? 'Gerando…' : 'Gerar'}
        disabled={busy !== null || list.length === 0}
        onClick={onXlsx}
      />

      {list.length === 0 && (
        <p className="mt-8 text-center text-sm text-[var(--text-muted)]">Sem despesas neste mês.</p>
      )}
    </AppShell>
  )
}

function ExportRow({
  Icon,
  title,
  subtitle,
  state,
  disabled,
  onClick,
}: {
  Icon: typeof FileText
  title: string
  subtitle: string
  state: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mb-3 flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left disabled:opacity-50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
        <Icon size={20} className="text-[var(--text)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
      </div>
      <span className="text-sm text-[var(--text-muted)]">{state}</span>
    </button>
  )
}
