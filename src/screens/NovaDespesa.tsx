import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addExpense } from '../db/repository'
import { readReceipt } from '../lib/ocr'
import { takePendingPhoto } from '../lib/pendingPhoto'
import { parseBRL, todayISO } from '../lib/format'
import {
  CATEGORY_LABELS,
  type Category,
  type PaymentType,
} from '../types'
import AppShell from '../components/AppShell'

export default function NovaDespesa() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [photo, setPhoto] = useState<Blob | undefined>()
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [ocrState, setOcrState] = useState<'idle' | 'lendo' | 'ok'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [paymentType, setPaymentType] = useState<PaymentType>('corporativo')
  const [category, setCategory] = useState<Category>('alimentacao')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Foto vinda do scanner (tela inicial de câmera)
  useEffect(() => {
    const scanned = takePendingPhoto()
    if (scanned) processPhoto(scanned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function processPhoto(file: Blob) {
    setPhoto(file)
    setPhotoUrl(URL.createObjectURL(file))

    // OCR roda em segundo plano — só pra poupar digitação
    setOcrState('lendo')
    setOcrProgress(0)
    try {
      const guess = await readReceipt(file, setOcrProgress)
      if (guess.amount) setAmount(guess.amount.toFixed(2).replace('.', ','))
      if (guess.date) setDate(guess.date)
      setOcrState('ok')
    } catch {
      setOcrState('idle')
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processPhoto(file)
  }

  async function onSave() {
    const value = parseBRL(amount)
    if (value <= 0) {
      alert('Informe um valor válido.')
      return
    }
    setSaving(true)
    await addExpense({
      date,
      amount: value,
      paymentType,
      category,
      vendor: vendor.trim(),
      description: description.trim(),
      source: photo ? 'ocr' : 'manual',
      photo,
    })
    navigate('/', { replace: true })
  }

  return (
    <AppShell title="Nova despesa" back>
      {/* Foto do comprovante */}
      <button
        onClick={() => fileRef.current?.click()}
        className="mb-4 flex h-44 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/40 active:bg-slate-800"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="Comprovante" className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="text-4xl">📸</span>
            <span className="text-slate-400">Fotografar comprovante</span>
            <span className="text-xs text-slate-500">(opcional — recibo manual não precisa)</span>
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickPhoto}
      />

      {ocrState === 'lendo' && (
        <p className="mb-3 text-center text-sm text-sky-400">
          Lendo comprovante… {Math.round(ocrProgress * 100)}%
        </p>
      )}
      {ocrState === 'ok' && (
        <p className="mb-3 text-center text-sm text-emerald-400">
          ✓ Confira os campos abaixo
        </p>
      )}

      {/* Forma de pagamento — destaque, decisão principal */}
      <Field label="Forma de pagamento">
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            active={paymentType === 'corporativo'}
            onClick={() => setPaymentType('corporativo')}
            color="sky"
          >
            🏢 Corporativo
          </Toggle>
          <Toggle
            active={paymentType === 'pessoal'}
            onClick={() => setPaymentType('pessoal')}
            color="amber"
          >
            👤 Pessoal
          </Toggle>
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
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <Field label="Categoria">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="input"
        >
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Estabelecimento (opcional)">
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Ex.: Restaurante do Aeroporto"
          className="input"
        />
      </Field>

      <Field label="Observação (opcional)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalhe da despesa"
          className="input"
        />
      </Field>

      <button
        onClick={onSave}
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-sky-500 py-4 text-base font-semibold text-white active:bg-sky-600 disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Salvar despesa'}
      </button>
    </AppShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color: 'sky' | 'amber'
  children: React.ReactNode
}) {
  const on =
    color === 'sky'
      ? 'border-sky-500 bg-sky-500/20 text-sky-300'
      : 'border-amber-500 bg-amber-500/20 text-amber-300'
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 py-3 font-medium transition ${
        active ? on : 'border-slate-700 bg-slate-800/40 text-slate-400'
      }`}
    >
      {children}
    </button>
  )
}
