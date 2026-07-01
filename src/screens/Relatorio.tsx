import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Table, Settings, Square, CheckSquare } from 'lucide-react'
import { db } from '../db/db'
import { monthRange, setReimbursement } from '../db/repository'
import { getProfile } from '../lib/profile'
import { formatBRL, formatDateBR, parseBRL } from '../lib/format'
import Toast, { type ToastData } from '../components/Toast'
import MonthNav from '../components/MonthNav'
import SegmentedTabs from '../components/SegmentedTabs'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { CATEGORY_LABELS, type Expense, type ReimbursementStatus } from '../types'
import AppShell from '../components/AppShell'

type Tab = 'cartao' | 'reembolso'

export default function Relatorio() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const [tab, setTab] = useState<Tab>('cartao')
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<ToastData | null>(null)
  const [adiantamento, setAdiantamento] = useState('')
  const [start, end] = useMemo(() => monthRange(ym.year, ym.month0), [ym])

  // Adiantamento lembrado por mês/aba (só entra na planilha)
  const advKey = `myrecibo.adiantamento.${start}.${tab}`
  useEffect(() => {
    setAdiantamento(localStorage.getItem(advKey) ?? '')
  }, [advKey])
  function onAdiantamento(v: string) {
    setAdiantamento(v)
    try {
      localStorage.setItem(advKey, v)
    } catch {
      /* quota */
    }
  }

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
      // Import dinâmico: pdf-lib só carrega quando o usuário gera
      const { exportReceiptsPDF } = await import('../lib/exporters')
      await exportReceiptsPDF(arr, periodo, titulo)
      setToast({ message: 'PDF gerado', kind: 'success' })
    } catch {
      setToast({ message: 'Não foi possível gerar o PDF. Tente de novo.', kind: 'error' })
    } finally {
      setBusy(null)
    }
  }
  async function genXlsx(arr: Expense[], tipo: string) {
    setBusy('xlsx')
    try {
      const { exportRelatorioXLSX } = await import('../lib/exporters')
      await exportRelatorioXLSX(arr, getProfile(), periodo, tipo, parseBRL(adiantamento) || 0)
      setToast({ message: 'Planilha gerada', kind: 'success' })
    } catch {
      setToast({ message: 'Não foi possível gerar a planilha. Tente de novo.', kind: 'error' })
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
      <MonthNav label={monthLabel} onPrev={() => shift(-1)} onNext={() => shift(1)} />

      <SegmentedTabs
        options={[
          { key: 'cartao', label: 'Cartão' },
          { key: 'reembolso', label: 'Reembolso' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'cartao' ? (
        <div className="mb-5">
          <StatCard
            big
            label={`${corp.length} despesa${corp.length === 1 ? '' : 's'} no cartão`}
            value={formatBRL(sum(corp))}
          />
        </div>
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
                        {formatDateBR(e.date)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-medium">{formatBRL(e.amount)}</span>
                      <StatusBadge status={e.reimbursement === 'na' ? 'pendente' : e.reimbursement} />
                    </div>
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
                {selected.size} selecionada{selected.size === 1 ? '' : 's'} para reembolso
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

      <label className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <span className="text-sm">
          <span className="block font-medium">Adiantamento</span>
          <span className="block text-xs text-[var(--text-muted)]">Entra no SALDO da planilha</span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-sm text-[var(--text-muted)]">R$</span>
          <input
            inputMode="decimal"
            value={adiantamento}
            onChange={(e) => onAdiantamento(e.target.value)}
            placeholder="0,00"
            className="input w-28 text-right"
          />
        </span>
      </label>

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

      <Toast toast={toast} onDone={() => setToast(null)} />
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
