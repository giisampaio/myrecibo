import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, User, Trash2, X } from 'lucide-react'
import { db } from '../db/db'
import { updateExpense, softDeleteExpense } from '../db/repository'
import { parseBRL, todayISO } from '../lib/format'
import {
  CATEGORY_LABELS,
  REIMBURSEMENT_LABELS,
  type Category,
  type PaymentType,
  type ReimbursementStatus,
} from '../types'
import AppShell from '../components/AppShell'
import Field from '../components/Field'
import PayToggle from '../components/PayToggle'

export default function ExpenseDetail() {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const expense = useLiveQuery(() => db.expenses.get(id), [id])

  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('corporativo')
  const [category, setCategory] = useState<Category>('outros')
  const [date, setDate] = useState(todayISO())
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [reimbursement, setReimbursement] = useState<ReimbursementStatus>('na')
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [lightbox, setLightbox] = useState(false)
  const [saving, setSaving] = useState(false)

  // Semeia os campos quando a despesa carrega
  useEffect(() => {
    if (!expense) return
    setAmount(expense.amount.toFixed(2).replace('.', ','))
    setPaymentType(expense.paymentType)
    setCategory(expense.category)
    setDate(expense.date)
    setVendor(expense.vendor)
    setDescription(expense.description)
    setInvoiceNumber(expense.invoiceNumber ?? '')
    setReimbursement(expense.reimbursement)
    if (expense.photo) {
      const url = URL.createObjectURL(expense.photo)
      setPhotoUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPhotoUrl(undefined)
  }, [expense])

  async function onSave() {
    if (!expense) return
    const value = parseBRL(amount)
    if (value <= 0) return alert('Informe um valor válido.')
    setSaving(true)
    const reimb: ReimbursementStatus =
      paymentType === 'pessoal' ? (reimbursement === 'na' ? 'pendente' : reimbursement) : 'na'
    await updateExpense(id, {
      amount: value,
      paymentType,
      category,
      date,
      vendor: vendor.trim(),
      description: description.trim(),
      invoiceNumber: invoiceNumber.trim() || undefined,
      reimbursement: reimb,
    })
    navigate('/despesas', { replace: true })
  }

  async function onDelete() {
    if (!confirm('Excluir esta despesa?')) return
    await softDeleteExpense(id)
    navigate('/despesas', { replace: true })
  }

  if (!expense || expense.deleted) {
    return (
      <AppShell title="Despesa" back>
        <p className="py-16 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
      </AppShell>
    )
  }

  return (
    <AppShell title="Despesa" back>
      {photoUrl && (
        <button
          onClick={() => setLightbox(true)}
          className="press mb-5 block h-44 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
        >
          <img src={photoUrl} alt="Comprovante" className="h-full w-full object-cover" />
        </button>
      )}

      <Field label="Valor (R$)">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="input"
        />
      </Field>

      <Field label="Forma de pagamento">
        <div className="grid grid-cols-2 gap-3">
          <PayToggle
            active={paymentType === 'corporativo'}
            onClick={() => setPaymentType('corporativo')}
            Icon={Building2}
            label="Corporativo"
          />
          <PayToggle
            active={paymentType === 'pessoal'}
            onClick={() => setPaymentType('pessoal')}
            Icon={User}
            label="Pessoal"
          />
        </div>
      </Field>

      {paymentType === 'pessoal' && (
        <Field label="Status do reembolso">
          <div className="grid grid-cols-3 gap-2">
            {(['pendente', 'solicitado', 'pago'] as ReimbursementStatus[]).map((s) => {
              const active = (reimbursement === 'na' ? 'pendente' : reimbursement) === s
              const color = `var(--status-${s})`
              return (
                <button
                  key={s}
                  onClick={() => setReimbursement(s)}
                  className="press rounded-xl border py-2.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: active ? color : 'var(--border)',
                    backgroundColor: active
                      ? `color-mix(in srgb, ${color} 12%, transparent)`
                      : 'var(--surface)',
                    color: active ? color : 'var(--text)',
                  }}
                >
                  {REIMBURSEMENT_LABELS[s]}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      <Field label="Categoria">
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="input">
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Data">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
      </Field>

      <Field label="Estabelecimento">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Opcional" className="input" />
      </Field>

      <Field label="Nº da nota (NF)">
        <input
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="Opcional — vai para a coluna Nº NF do relatório"
          className="input"
        />
      </Field>

      <Field label="Observação">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalhe da despesa"
          className="input"
        />
      </Field>

      <button onClick={onSave} disabled={saving} className="btn-primary mt-4">
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>
      <button
        onClick={onDelete}
        className="press mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-[var(--danger)]"
      >
        <Trash2 size={18} /> Excluir despesa
      </button>

      {lightbox && photoUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setLightbox(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <img src={photoUrl} alt="Comprovante" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </AppShell>
  )
}

