import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Table, Settings, Square, CheckSquare, CalendarRange, X } from 'lucide-react'
import { db } from '../db/db'
import { monthRange, setReimbursement } from '../db/repository'
import { getProfile } from '../lib/profile'
import { formatBRL, formatDateBR, parseBRL } from '../lib/format'
import Toast, { type ToastData } from '../components/Toast'
import MonthNav from '../components/MonthNav'
import RangeCalendar from '../components/RangeCalendar'
import SegmentedTabs from '../components/SegmentedTabs'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { CATEGORY_LABELS, type Expense, type ReimbursementStatus } from '../types'
import AppShell from '../components/AppShell'

type Tab = 'cartao' | 'reembolso'

/** Soma/subtrai um dia numa data ISO (a query usa fim exclusivo). */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function prevDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function Relatorio() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const [tab, setTab] = useState<Tab>('cartao')
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<ToastData | null>(null)
  const [adiantamento, setAdiantamento] = useState('')
  // Período: mês (padrão) ou intervalo personalizado (inclusivo).
  // `end: null` = usuário marcou o início e ainda vai tocar no fim.
  const [custom, setCustom] = useState<{ start: string; end: string | null } | null>(null)
  const [start, end] = useMemo(() => {
    if (custom) return [custom.start, nextDay(custom.end ?? custom.start)] as [string, string]
    return monthRange(ym.year, ym.month0)
  }, [ym, custom])

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
  const periodo = custom
    ? `${formatDateBR(custom.start)} a ${formatDateBR(custom.end ?? custom.start)}`
    : monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

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
      const overflow = await exportRelatorioXLSX(
        arr,
        getProfile(),
        periodo,
        tipo,
        parseBRL(adiantamento) || 0,
      )
      setToast(
        overflow > 0
          ? { message: `Planilha gerada — ${overflow} despesa(s) não couberam no modelo`, kind: 'error' }
          : { message: 'Planilha gerada', kind: 'success' },
      )
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
      {custom ? (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              <CalendarRange size={14} /> {periodo}
            </span>
            <button
              onClick={() => setCustom(null)}
              className="press flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]"
            >
              <X size={14} /> Usar mês
            </button>
          </div>
          <RangeCalendar
            start={custom.start}
            end={custom.end}
            onChange={(s, e) => setCustom({ start: s, end: e })}
          />
        </div>
      ) : (
        <>
          <MonthNav label={monthLabel} onPrev={() => shift(-1)} onNext={() => shift(1)} />
          <button
            onClick={() => {
              const [ms, me] = monthRange(ym.year, ym.month0)
              setCustom({ start: ms, end: prevDay(me) })
            }}
            className="press -mt-2 mb-3 flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-[var(--text-muted)]"
          >
            <CalendarRange size={14} /> Período personalizado
          </button>
        </>
      )}

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
