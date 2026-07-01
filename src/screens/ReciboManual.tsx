import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import { addExpense } from '../db/repository'
import { nodeToImage, imageToPdf } from '../lib/receiptRender'
import { RECEIPT_TEMPLATES, type ReceiptRenderData } from '../lib/receiptTemplates'
import { parseBRL, todayISO, formatBRL } from '../lib/format'
import {
  CATEGORY_LABELS,
  type Category,
  type PaymentType,
  type ReceiptItem,
  type ReceiptTemplate,
} from '../types'
import AppShell from '../components/AppShell'
import Field from '../components/Field'

export default function ReciboManual() {
  const navigate = useNavigate()
  const captureRef = useRef<HTMLDivElement>(null)

  const [template, setTemplate] = useState<ReceiptTemplate>('classico')
  const [issuerName, setIssuerName] = useState('')
  const [issuerDoc, setIssuerDoc] = useState('')
  const [payerName, setPayerName] = useState('')
  const [payerDoc, setPayerDoc] = useState('')
  const [city, setCity] = useState('')
  const [refersTo, setRefersTo] = useState('')
  const [date, setDate] = useState(todayISO())
  const [valor, setValor] = useState('')
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [paymentType, setPaymentType] = useState<PaymentType>('pessoal')
  const [category, setCategory] = useState<Category>('outros')
  const [busy, setBusy] = useState<null | 'pdf' | 'save'>(null)
  const [advanced, setAdvanced] = useState(false)

  const itemsTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const total = itemsTotal > 0 ? itemsTotal : parseBRL(valor)

  const data: ReceiptRenderData = {
    issuerName,
    issuerDoc,
    payerName,
    payerDoc,
    city,
    date,
    refersTo,
    items,
    total,
  }
  const def = RECEIPT_TEMPLATES.find((t) => t.key === template) ?? RECEIPT_TEMPLATES[0]

  function addItem() {
    setItems([...items, { description: '', qty: 1, unitPrice: 0 }])
  }
  function patchItem(i: number, patch: Partial<ReceiptItem>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  async function rasterize(): Promise<Blob | null> {
    const node = captureRef.current
    if (!node) return null
    return nodeToImage(node)
  }

  async function onDownload() {
    if (total <= 0) return alert('Informe um valor ou itens.')
    setBusy('pdf')
    try {
      const img = await rasterize()
      if (!img) return
      const pdf = await imageToPdf(img)
      const url = URL.createObjectURL(pdf)
      const a = document.createElement('a')
      a.href = url
      a.download = `recibo-${date}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setBusy(null)
    }
  }

  async function onSave() {
    if (total <= 0) return alert('Informe um valor ou itens.')
    setBusy('save')
    try {
      const img = await rasterize()
      await addExpense({
        date,
        amount: total,
        paymentType,
        category,
        vendor: issuerName.trim(),
        description: refersTo.trim(),
        source: 'recibo',
        photo: img ?? undefined,
      })
      navigate('/despesas', { replace: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <AppShell title="Recibo manual" back>
      {/* Galeria de modelos */}
      <Label>Modelo</Label>
      <div className="-mx-4 mb-5 flex gap-3 overflow-x-auto px-4 pb-1">
        {RECEIPT_TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTemplate(t.key)}
            className="press flex shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className="overflow-hidden rounded-lg border-2 bg-white"
              style={{ borderColor: template === t.key ? 'var(--ink)' : 'var(--border)' }}
            >
              <ReceiptCanvas fitWidth={104}>
                <t.Component data={data} />
              </ReceiptCanvas>
            </div>
            <span
              className="text-[11px]"
              style={{ color: template === t.key ? 'var(--text)' : 'var(--text-muted)' }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Preview grande */}
      <div className="mb-6 flex justify-center rounded-xl bg-[var(--surface-2)] p-4">
        <div className="shadow-lg">
          <ReceiptCanvas fitWidth={300} cap>
            <def.Component data={data} />
          </ReceiptCanvas>
        </div>
      </div>

      {/* Itens */}
      <div className="mb-2 flex items-center justify-between">
        <Label>Itens (opcional)</Label>
        <button
          onClick={addItem}
          className="press flex items-center gap-1 text-sm font-medium text-[var(--text)]"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Sem itens, usa o valor abaixo. Com itens, o total é calculado.
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={it.description}
                  onChange={(e) => patchItem(i, { description: e.target.value })}
                  placeholder="Descrição do item"
                  className="input flex-1"
                />
                <button
                  onClick={() => removeItem(i)}
                  className="press shrink-0 p-1 text-[var(--text-muted)]"
                  aria-label="Remover item"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Qtd</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={it.qty}
                    onChange={(e) => patchItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className="input"
                    aria-label="Quantidade"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Valor unitário</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={it.unitPrice || ''}
                    onChange={(e) => patchItem(i, { unitPrice: Number(e.target.value) || 0 })}
                    placeholder="0,00"
                    className="input"
                    aria-label="Valor unitário"
                  />
                </label>
              </div>
              <div className="mt-2 text-right text-xs text-[var(--text-muted)]">
                Subtotal: {formatBRL(it.qty * it.unitPrice)}
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-1 text-sm font-medium">Total: {formatBRL(itemsTotal)}</div>
        </div>
      )}

      {/* Essenciais */}
      {items.length === 0 && (
        <Field label="Valor (R$)">
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="input"
          />
        </Field>
      )}

      <Field label="Referente a">
        <input
          value={refersTo}
          onChange={(e) => setRefersTo(e.target.value)}
          placeholder="Ex.: transporte aeroporto-hotel"
          className="input"
        />
      </Field>

      <Field label="Emitente (quem assina / estabelecimento)">
        <input value={issuerName} onChange={(e) => setIssuerName(e.target.value)} placeholder="Nome" className="input" />
      </Field>

      <Field label="Pagador (quem pagou)">
        <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Nome" className="input" />
      </Field>

      {/* Mais detalhes (recolhível) */}
      <button
        onClick={() => setAdvanced(!advanced)}
        className="press mb-3 flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]"
      >
        <span>Mais detalhes</span>
        <ChevronDown
          size={16}
          className="transition-transform"
          style={{ transform: advanced ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Field label="Data">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </Field>
            <Field label="Cidade">
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className="input" />
            </Field>
            <Field label="CPF/CNPJ do emitente">
              <input value={issuerDoc} onChange={(e) => setIssuerDoc(e.target.value)} placeholder="Opcional" className="input" />
            </Field>
            <Field label="CPF/CNPJ do pagador">
              <input value={payerDoc} onChange={(e) => setPayerDoc(e.target.value)} placeholder="Opcional" className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Forma de pagamento">
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className="input">
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
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={onDownload} disabled={busy !== null} className="btn-ghost">
          {busy === 'pdf' ? 'Gerando…' : 'Baixar PDF'}
        </button>
        <button onClick={onSave} disabled={busy !== null} className="btn-primary">
          {busy === 'save' ? 'Salvando…' : 'Salvar despesa'}
        </button>
      </div>

      {/* Nó off-screen em tamanho real para rasterizar */}
      <div ref={captureRef} style={{ position: 'fixed', left: -10000, top: 0, background: '#fff' }}>
        <def.Component data={data} />
      </div>
    </AppShell>
  )
}

/** Renderiza um modelo e o escala para caber em fitWidth (mede o tamanho real). */
function ReceiptCanvas({ children, fitWidth, cap }: { children: ReactNode; fitWidth: number; cap?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 380, h: 480 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    setDim((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
  })
  let scale = fitWidth / dim.w
  if (cap) scale = Math.min(1, scale)
  return (
    <div style={{ width: dim.w * scale, height: dim.h * scale, overflow: 'hidden' }}>
      <div ref={ref} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', display: 'inline-block' }}>
        {children}
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">{children}</div>
}
