import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  X,
  Image as ImageIcon,
  Building2,
  User,
  ChevronDown,
  Utensils,
  BedDouble,
  ShoppingBag,
  Car,
  Wrench,
  Printer,
  MoreHorizontal,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { addExpense } from '../db/repository'
import { readReceipt } from '../lib/ocr'
import { takePendingPhoto } from '../lib/pendingPhoto'
import { formatBRL, parseBRL, todayISO, formatDateBR } from '../lib/format'
import { type Category, type PaymentType } from '../types'

const STEPS = ['valor', 'categoria', 'pagamento'] as const
type Step = (typeof STEPS)[number]

const CATEGORIES: { key: Category; label: string; Icon: LucideIcon }[] = [
  { key: 'alimentacao', label: 'Alimentação', Icon: Utensils },
  { key: 'hospedagem', label: 'Hospedagem', Icon: BedDouble },
  { key: 'comissaria', label: 'Comissaria', Icon: ShoppingBag },
  { key: 'transporte', label: 'Transporte', Icon: Car },
  { key: 'peca', label: 'Peça', Icon: Wrench },
  { key: 'impressao', label: 'Impressão', Icon: Printer },
  { key: 'outros', label: 'Outros', Icon: MoreHorizontal },
]

export default function NovaDespesa() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [photo, setPhoto] = useState<Blob | undefined>()
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [reading, setReading] = useState(false)
  const [candidates, setCandidates] = useState<number[]>([])

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)

  const [stepIdx, setStepIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const step: Step = STEPS[stepIdx]

  useEffect(() => {
    const scanned = takePendingPhoto()
    if (scanned) processPhoto(scanned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function processPhoto(file: Blob) {
    setPhoto(file)
    setPhotoUrl(URL.createObjectURL(file))
    setReading(true)
    try {
      const guess = await readReceipt(file)
      if (guess.amount != null) setAmount(guess.amount.toFixed(2).replace('.', ','))
      setCandidates(guess.candidates)
      if (guess.date) setDate(guess.date)
    } catch {
      /* OCR opcional */
    } finally {
      setReading(false)
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processPhoto(file)
  }

  function go(to: number) {
    setDir(to > stepIdx ? 1 : -1)
    setStepIdx(to)
  }

  function onBack() {
    if (stepIdx === 0) navigate(-1)
    else go(stepIdx - 1)
  }

  async function onSave() {
    const value = parseBRL(amount)
    if (value <= 0 || !category || !paymentType) return
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
    navigate('/despesas', { replace: true })
  }

  const variants = {
    enter: (d: number) => ({ x: d * 48, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -48, opacity: 0 }),
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--text)]">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button onClick={onBack} className="-ml-1 p-2 text-[var(--text-muted)]" aria-label="Voltar">
          {stepIdx === 0 ? <X size={22} /> : <ArrowLeft size={22} />}
        </button>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === stepIdx ? 20 : 6,
                backgroundColor: i <= stepIdx ? 'var(--ink)' : 'var(--border-strong)',
              }}
            />
          ))}
        </div>
        <span className="w-8" />
      </header>

      {/* Conteúdo dos passos */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence custom={dir} mode="wait" initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            {step === 'valor' && (
              <StepValor
                photoUrl={photoUrl}
                reading={reading}
                amount={amount}
                setAmount={setAmount}
                candidates={candidates}
                onPick={() => fileRef.current?.click()}
                onNext={() => go(1)}
              />
            )}
            {step === 'categoria' && (
              <StepCategoria
                selected={category}
                onSelect={(c) => {
                  setCategory(c)
                  go(2)
                }}
              />
            )}
            {step === 'pagamento' && (
              <StepPagamento
                paymentType={paymentType}
                setPaymentType={setPaymentType}
                advanced={advanced}
                setAdvanced={setAdvanced}
                date={date}
                setDate={setDate}
                vendor={vendor}
                setVendor={setVendor}
                description={description}
                setDescription={setDescription}
                saving={saving}
                onSave={onSave}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickPhoto}
      />
    </div>
  )
}

/* ---------- Passo 1: valor ---------- */

function StepValor({
  photoUrl,
  reading,
  amount,
  setAmount,
  candidates,
  onPick,
  onNext,
}: {
  photoUrl?: string
  reading: boolean
  amount: string
  setAmount: (v: string) => void
  candidates: number[]
  onPick: () => void
  onNext: () => void
}) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center">
        <button
          onClick={onPick}
          className="mb-6 flex h-20 w-24 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
          aria-label="Trocar foto"
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={26} className="text-[var(--text-muted)]" />
          )}
        </button>

        <p className="mb-1 text-sm text-[var(--text-muted)]">
          {reading ? 'Lendo o comprovante…' : 'Confirme o valor'}
        </p>

        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-medium text-[var(--text-muted)]">R$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            autoFocus={!reading && !amount}
            className="w-[5.5ch] bg-transparent text-center text-5xl font-medium tracking-tight text-[var(--text)] outline-none placeholder:text-[var(--border-strong)]"
            style={{ width: `${Math.max(4, amount.length + 1)}ch` }}
          />
        </div>

        {candidates.length > 1 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {candidates.map((c) => {
              const str = c.toFixed(2).replace('.', ',')
              const active = str === amount
              return (
                <button
                  key={c}
                  onClick={() => setAmount(str)}
                  className="rounded-full border px-3 py-1.5 text-sm transition-colors"
                  style={{
                    borderColor: active ? 'var(--ink)' : 'var(--border)',
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    backgroundColor: active ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  {formatBRL(c)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button onClick={onNext} disabled={parseBRL(amount) <= 0} className="btn-primary">
        Continuar
      </button>
    </>
  )
}

/* ---------- Passo 2: categoria ---------- */

function StepCategoria({
  selected,
  onSelect,
}: {
  selected: Category | null
  onSelect: (c: Category) => void
}) {
  return (
    <>
      <p className="mb-5 mt-2 text-center text-base font-medium">Qual a categoria?</p>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ key, label, Icon }) => {
          const active = selected === key
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className="flex flex-col items-center gap-2 rounded-xl border p-5 transition-colors"
              style={{
                borderColor: active ? 'var(--ink)' : 'var(--border)',
                backgroundColor: active ? 'var(--surface-2)' : 'var(--surface)',
              }}
            >
              <Icon size={26} className="text-[var(--text)]" />
              <span className="text-sm text-[var(--text)]">{label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ---------- Passo 3: pagamento + avançado ---------- */

function StepPagamento({
  paymentType,
  setPaymentType,
  advanced,
  setAdvanced,
  date,
  setDate,
  vendor,
  setVendor,
  description,
  setDescription,
  saving,
  onSave,
}: {
  paymentType: PaymentType | null
  setPaymentType: (p: PaymentType) => void
  advanced: boolean
  setAdvanced: (v: boolean) => void
  date: string
  setDate: (v: string) => void
  vendor: string
  setVendor: (v: string) => void
  description: string
  setDescription: (v: string) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <>
      <div className="flex-1">
        <p className="mb-5 mt-2 text-center text-base font-medium">Como você pagou?</p>

        <div className="grid grid-cols-2 gap-3">
          <PayCard
            active={paymentType === 'corporativo'}
            onClick={() => setPaymentType('corporativo')}
            Icon={Building2}
            label="Corporativo"
          />
          <PayCard
            active={paymentType === 'pessoal'}
            onClick={() => setPaymentType('pessoal')}
            Icon={User}
            label="Pessoal"
          />
        </div>

        {/* Avançado (raro): data, estabelecimento, observação */}
        <button
          onClick={() => setAdvanced(!advanced)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]"
        >
          <span>Avançado</span>
          <span className="flex items-center gap-2 text-xs">
            {!advanced && formatDateBR(date)}
            <ChevronDown
              size={16}
              className="transition-transform"
              style={{ transform: advanced ? 'rotate(180deg)' : 'none' }}
            />
          </span>
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
              <div className="space-y-3 pt-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-muted)]">Data</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-muted)]">Estabelecimento</span>
                  <input
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="Restaurante do aeroporto"
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-muted)]">Observação</span>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detalhe da despesa"
                    className="input"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button onClick={onSave} disabled={!paymentType || saving} className="btn-primary">
        {saving ? 'Salvando…' : 'Salvar despesa'}
      </button>
    </>
  )
}

function PayCard({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  Icon: LucideIcon
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-2 rounded-xl border p-6 transition-colors"
      style={{
        borderColor: active ? 'var(--ink)' : 'var(--border)',
        backgroundColor: active ? 'var(--surface-2)' : 'var(--surface)',
      }}
    >
      {active && (
        <span className="absolute right-2 top-2 text-[var(--ink)]">
          <Check size={16} />
        </span>
      )}
      <Icon size={28} className="text-[var(--text)]" />
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
    </button>
  )
}
