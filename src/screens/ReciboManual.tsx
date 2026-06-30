import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addExpense } from '../db/repository'
import { buildReceiptPDF } from '../lib/receipt'
import { parseBRL, todayISO } from '../lib/format'
import {
  CATEGORY_LABELS,
  type Category,
  type PaymentType,
  type ReceiptTemplate,
} from '../types'
import AppShell from '../components/AppShell'

const TEMPLATES: { key: ReceiptTemplate; label: string; preview: string }[] = [
  { key: 'classico', label: 'Clássico', preview: 'bg-blue-900' },
  { key: 'moderno', label: 'Moderno', preview: 'bg-cyan-600' },
  { key: 'minimalista', label: 'Minimalista', preview: 'bg-slate-700' },
]

export default function ReciboManual() {
  const navigate = useNavigate()

  const [template, setTemplate] = useState<ReceiptTemplate>('classico')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [payerName, setPayerName] = useState('')
  const [payerDoc, setPayerDoc] = useState('')
  const [issuerName, setIssuerName] = useState('')
  const [issuerDoc, setIssuerDoc] = useState('')
  const [city, setCity] = useState('')
  const [refersTo, setRefersTo] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('pessoal')
  const [category, setCategory] = useState<Category>('outros')

  function data() {
    return {
      template,
      amount: parseBRL(amount),
      date,
      payerName,
      payerDoc,
      issuerName,
      issuerDoc,
      city,
      refersTo,
    }
  }

  function valid(): boolean {
    if (parseBRL(amount) <= 0) {
      alert('Informe um valor válido.')
      return false
    }
    return true
  }

  async function onDownload() {
    if (!valid()) return
    const blob = await buildReceiptPDF(data())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recibo-${date}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function onSave() {
    if (!valid()) return
    const { template: _t, amount: _a, date: _d, ...receiptMeta } = data()
    await addExpense({
      date,
      amount: parseBRL(amount),
      paymentType,
      category,
      vendor: issuerName,
      description: refersTo,
      source: 'recibo',
      receipt: { template, ...receiptMeta },
    })
    navigate('/despesas', { replace: true })
  }

  return (
    <AppShell title="Recibo manual" back>
      <Field label="Modelo">
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTemplate(t.key)}
              className="flex flex-col items-center gap-1 rounded-xl border-2 p-2"
              style={{ borderColor: template === t.key ? 'var(--ink)' : 'var(--border)' }}
            >
              <span className={`h-10 w-full rounded ${t.preview}`} />
              <span className="text-xs text-[var(--text-muted)]">{t.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="input"
          />
        </Field>
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </Field>
      </div>

      <Field label="Referente a">
        <input
          value={refersTo}
          onChange={(e) => setRefersTo(e.target.value)}
          placeholder="Ex.: transporte aeroporto-hotel"
          className="input"
        />
      </Field>

      <Field label="Pagador (quem pagou)">
        <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Nome" className="input mb-2" />
        <input value={payerDoc} onChange={(e) => setPayerDoc(e.target.value)} placeholder="CPF/CNPJ (opcional)" className="input" />
      </Field>

      <Field label="Emitente (quem recebeu / assina)">
        <input value={issuerName} onChange={(e) => setIssuerName(e.target.value)} placeholder="Nome" className="input mb-2" />
        <input value={issuerDoc} onChange={(e) => setIssuerDoc(e.target.value)} placeholder="CPF/CNPJ (opcional)" className="input" />
      </Field>

      <Field label="Cidade">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className="input" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Forma de pagamento">
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as PaymentType)}
            className="input"
          >
            <option value="corporativo">Corporativo</option>
            <option value="pessoal">Pessoal</option>
          </select>
        </Field>
        <Field label="Categoria">
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="input">
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={onDownload} className="btn-ghost">
          Baixar PDF
        </button>
        <button onClick={onSave} className="btn-primary">
          Salvar despesa
        </button>
      </div>
    </AppShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}
