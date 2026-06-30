import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Table,
  Settings,
  Square,
  CheckSquare,
} from 'lucide-react'
import { db } from '../db/db'
import { monthRange, setReimbursement } from '../db/repository'
import { exportReceiptsPDF, exportRelatorioXLSX } from '../lib/exporters'
import { getProfile } from '../lib/profile'
import { formatBRL, formatDateBR } from '../lib/format'
import {
  CATEGORY_LABELS,
  REIMBURSEMENT_LABELS,
  type Expense,
  type ReimbursementStatus,
} from '../types'
import AppShell from '../components/AppShell'

type Tab = 'cartao' | 'reembolso'

export default function Relatorio() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const [tab, setTab] = useState<Tab>('cartao')
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [start, end] = useMemo(() => monthRange(ym.year, ym.month0), [ym])

  const expenses = useLiveQuery(
    () =>
      db.expenses
        .where('date')
        .between(start, end, true, false)
        .filter((e) => !e.deleted)
        .sortBy('date'),
    [start, end],
  )

  const list = expenses ?? []
  const corp = list.filter((e) => e.paymentType === 'corporativo')
  const pess = list.filter((e) => e.paymentType === 'pessoal')

  // Seleciona por padrão as despesas pessoais ainda não pagas
  useEffect(() => {
    setSelected(new Set(pess.filter((e) => e.reimbursement !== 'pago').map((e) => e.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, pess.length])

  const monthLabel = new Date(ym.year, ym.month0).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  const periodo = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  const selectedList = pess.filter((e) => selected.has(e.id))
  const sum = (arr: Expense[]) => arr.reduce((s, e) => s + e.amount, 0)

  function shift(delta: number) {
    const d = new Date(ym.year, ym.month0 + delta)
    setYm({ year: d.getFullYear(), month0: d.getMonth() })
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function genPdf(arr: Expense[], titulo: string) {
    setBusy('pdf')
    try {
      await exportReceiptsPDF(arr, periodo, titulo)
    } finally {
      setBusy(null)
    }
  }
  function genXlsx(arr: Expense[], tipo: string) {
    setBusy('xlsx')
    try {
      exportRelatorioXLSX(arr, getProfile(), periodo, tipo)
    } finally {
      setBusy(null)
    }
  }
  async function mark(status: ReimbursementStatus) {
    if (selected.size === 0) return
    await setReimbursement([...selected], status)
  }

  const arr = tab === 'cartao' ? corp : selectedList
  const tipo = tab === 'cartao' ? 'Cartão (Corporativo)' : 'Reembolso'

  return (
    <AppShell
      title="Relatório"
      action={
        <Link to="/perfil" className="icon-btn" aria-label="Perfil do relatório">
          <Settings size={20} />
        </Link>
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="icon-btn -ml-2.5" aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </button>
        <span className="font-medium capitalize">{monthLabel}</span>
        <button onClick={() => shift(1)} className="icon-btn -mr-2.5" aria-label="Próximo mês">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Abas */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        <TabBtn active={tab === 'cartao'} onClick={() => setTab('cartao')}>
          Cartão
        </TabBtn>
        <TabBtn active={tab === 'reembolso'} onClick={() => setTab('reembolso')}>
          Reembolso
        </TabBtn>
      </div>

      {tab === 'cartao' ? (
        <>
          <div className="mb-5 rounded-xl bg-[var(--surface-2)] p-4">
            <div className="text-xs text-[var(--text-muted)]">{corp.length} despesas no cartão</div>
            <div className="mt-0.5 text-2xl font-medium">{formatBRL(sum(corp))}</div>
          </div>
        </>
      ) : (
        <>
          <ul className="mb-4 space-y-2">
            {pess.map((e) => {
              const on = selected.has(e.id)
              return (
                <li key={e.id}>
                  <button
                    onClick={() => toggle(e.id)}
                    className="press flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"
                  >
                    {on ? (
                      <CheckSquare size={20} className="shrink-0 text-[var(--ink)]" />
                    ) : (
                      <Square size={20} className="shrink-0 text-[var(--text-muted)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {e.vendor || CATEGORY_LABELS[e.category]}
                      </div>
                      <div className="truncate text-xs text-[var(--text-muted)]">
                        {formatDateBR(e.date)} · {statusLabel(e.reimbursement)}
                      </div>
                    </div>
                    <div className="text-right font-medium">{formatBRL(e.amount)}</div>
                  </button>
                </li>
              )
            })}
            {pess.length === 0 && (
              <li className="py-10 text-center text-sm text-[var(--text-muted)]">
                Nenhuma despesa pessoal neste mês.
              </li>
            )}
          </ul>

          {pess.length > 0 && (
            <div className="mb-5 rounded-xl bg-[var(--surface-2)] p-4">
              <div className="text-xs text-[var(--text-muted)]">
                {selected.size} selecionada(s) para reembolso
              </div>
              <div className="mt-0.5 text-2xl font-medium">{formatBRL(sum(selectedList))}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => mark('solicitado')}
                  disabled={selected.size === 0}
                  className="btn-ghost"
                >
                  Marcar solicitado
                </button>
                <button
                  onClick={() => mark('pago')}
                  disabled={selected.size === 0}
                  className="btn-ghost"
                >
                  Marcar pago
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ExportRow
        Icon={FileText}
        title="PDF dos comprovantes"
        subtitle={`Resumo + 1 página por foto · ${tipo}`}
        state={busy === 'pdf' ? 'Gerando…' : 'Gerar'}
        disabled={busy !== null || arr.length === 0}
        onClick={() => genPdf(arr, tipo)}
      />
      <ExportRow
        Icon={Table}
        title="Planilha (modelo Scheffer)"
        subtitle={tipo}
        state={busy === 'xlsx' ? 'Gerando…' : 'Gerar'}
        disabled={busy !== null || arr.length === 0}
        onClick={() => genXlsx(arr, tipo)}
      />
    </AppShell>
  )
}

function statusLabel(s: ReimbursementStatus): string {
  return REIMBURSEMENT_LABELS[s === 'na' ? 'pendente' : s]
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="press rounded-lg py-2 text-sm font-medium"
      style={{
        backgroundColor: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      {children}
    </button>
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
      className="press mb-3 flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left disabled:opacity-50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
        <Icon size={20} className="text-[var(--text)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="truncate text-xs text-[var(--text-muted)]">{subtitle}</div>
      </div>
      <span className="shrink-0 text-sm text-[var(--text-muted)]">{state}</span>
    </button>
  )
}
