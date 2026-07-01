import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  ArrowLeft,
  X,
  Image as ImageIcon,
  Building2,
  User,
  ChevronDown,
  Delete,
  Loader2,
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
import { readReceipt, isOcrReady } from '../lib/ocr'
import { peekPendingPhoto, clearPendingPhoto } from '../lib/pendingPhoto'
import { haptic } from '../lib/haptics'
import { formatBRL, formatCentsBR, todayISO, formatDateBR } from '../lib/format'
import { CATEGORY_LABELS, type Category, type PaymentType } from '../types'
import Field from '../components/Field'
import PayToggle from '../components/PayToggle'

type Step = 'valor' | 'categoria' | 'pagamento'

const CATEGORIES: { key: Category; label: string; Icon: LucideIcon }[] = [
  { key: 'alimentacao', label: 'Alimentação', Icon: Utensils },
  { key: 'hospedagem', label: 'Hospedagem', Icon: BedDouble },
  { key: 'comissaria', label: 'Comissaria', Icon: ShoppingBag },
  { key: 'transporte', label: 'Transporte', Icon: Car },
  { key: 'peca', label: 'Peça', Icon: Wrench },
  { key: 'impressao', label: 'Impressão', Icon: Printer },
  { key: 'outros', label: 'Outros', Icon: MoreHorizontal },
]

const MAX_CENTS = 9_999_999_99 // até R$ 99.999.999,99

export default function NovaDespesa() {
  const navigate = useNavigate()

  const [photo, setPhoto] = useState<Blob | undefined>()
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [reading, setReading] = useState(false)
  const [readingLabel, setReadingLabel] = useState('')
  const [candidates, setCandidates] = useState<number[]>([])

  const [cents, setCents] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [skipCategory, setSkipCategory] = useState(false)
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  const steps = useMemo<Step[]>(
    () => (skipCategory ? ['valor', 'pagamento'] : ['valor', 'categoria', 'pagamento']),
    [skipCategory],
  )
  const [stepIdx, setStepIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const step = steps[Math.min(stepIdx, steps.length - 1)]

  // O usuário nunca espera o OCR: se ele já digitou/avançou, a leitura não
  // sobrescreve nada. Refs guardam o estado mais recente para o callback async.
  const touchedRef = useRef(false) // usuário mexeu no valor
  const stepIdxRef = useRef(0)
  stepIdxRef.current = stepIdx

  useEffect(() => {
    // Espia (não consome): sair do wizard sem salvar preserva a foto.
    const scanned = peekPendingPhoto()
    if (scanned) processPhoto(scanned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Libera o object URL anterior quando trocar/desmontar
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  async function processPhoto(file: Blob) {
    setPhoto(file)
    setPhotoUrl(URL.createObjectURL(file))
    setReading(true)
    setReadingLabel(
      isOcrReady()
        ? 'Lendo o comprovante — pode digitar'
        : 'Baixando o leitor (só na 1ª vez) — pode digitar',
    )
    try {
      const guess = await readReceipt(file)
      if (guess.amount != null && !touchedRef.current) setCents(Math.round(guess.amount * 100))
      setCandidates(guess.candidates)
      if (guess.date) setDate(guess.date)
      // Só pula o passo de categoria se o usuário ainda está no valor
      if (guess.category && stepIdxRef.current === 0) {
        setCategory((c) => c ?? guess.category!)
        setSkipCategory(true)
      }
      // Estabelecimento lido do topo do cupom (não sobrescreve o digitado)
      if (guess.vendor) setVendor((v) => v || guess.vendor!)
    } catch {
      /* OCR opcional */
    } finally {
      setReading(false)
    }
  }

  function go(to: number) {
    setDir(to > stepIdx ? 1 : -1)
    setStepIdx(to)
  }
  function onBack() {
    if (stepIdx === 0) navigate(-1)
    else go(stepIdx - 1)
  }

  function pushDigit(d: number) {
    touchedRef.current = true
    setCents((c) => Math.min(c * 10 + d, MAX_CENTS))
  }
  function popDigit() {
    touchedRef.current = true
    setCents((c) => Math.floor(c / 10))
  }
  function pickCents(c: number) {
    touchedRef.current = true
    setCents(c)
  }

  async function onSave() {
    if (cents <= 0 || !category || !paymentType) return
    setSaving(true)
    await addExpense({
      date,
      amount: cents / 100,
      paymentType,
      category,
      vendor: vendor.trim(),
      description: description.trim(),
      invoiceNumber: invoiceNumber.trim() || undefined,
      source: photo ? 'ocr' : 'manual',
      photo,
    })
    clearPendingPhoto()
    haptic('success')
    setSaved(true)
    setTimeout(() => navigate('/despesas', { replace: true }), 800)
  }

  const variants = {
    enter: (d: number) => ({ x: d * 48, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -48, opacity: 0 }),
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <header
        className="flex items-center justify-between px-[var(--screen-x)] pt-[max(0px,env(safe-area-inset-top))]"
        style={{ minHeight: 'var(--header-h)' }}
      >
        <button onClick={onBack} className="icon-btn -ml-2.5" aria-label="Voltar">
          {stepIdx === 0 ? <X size={22} /> : <ArrowLeft size={22} />}
        </button>
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
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
        <span className="w-[var(--tap)]" />
      </header>

      <div className="relative flex-1 overflow-hidden">
        <MotionConfig reducedMotion="user">
        <AnimatePresence custom={dir} mode="wait" initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col px-[var(--screen-x)] pb-[max(16px,env(safe-area-inset-bottom))] pt-2"
          >
            {step === 'valor' && (
              <StepValor
                photoUrl={photoUrl}
                reading={reading}
                readingLabel={readingLabel}
                cents={cents}
                candidates={candidates}
                onPick={() => (photoUrl ? setLightbox(true) : navigate('/'))}
                onDigit={pushDigit}
                onBackspace={popDigit}
                onSetCents={pickCents}
                onNext={() => go(1)}
              />
            )}
            {step === 'categoria' && (
              <StepCategoria
                selected={category}
                onSelect={(c) => {
                  setCategory(c)
                  go(stepIdx + 1)
                }}
              />
            )}
            {step === 'pagamento' && (
              <StepPagamento
                paymentType={paymentType}
                setPaymentType={setPaymentType}
                category={category}
                setCategory={setCategory}
                advanced={advanced}
                setAdvanced={setAdvanced}
                date={date}
                setDate={setDate}
                vendor={vendor}
                setVendor={setVendor}
                description={description}
                setDescription={setDescription}
                invoiceNumber={invoiceNumber}
                setInvoiceNumber={setInvoiceNumber}
                saving={saving}
                onSave={onSave}
              />
            )}
          </motion.div>
        </AnimatePresence>
        </MotionConfig>
      </div>

      {saved && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg)]">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-contrast)]"
          >
            <Check size={40} />
          </motion.div>
        </div>
      )}

      {lightbox && photoUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setLightbox(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
            <button
              onClick={() => navigate('/')}
              className="press flex h-11 items-center rounded-full bg-white/15 px-4 text-sm font-medium text-white"
            >
              Trocar foto
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <img src={photoUrl} alt="Comprovante" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Passo 1: valor (teclado próprio + máscara) ---------- */

function StepValor({
  photoUrl,
  reading,
  readingLabel,
  cents,
  candidates,
  onPick,
  onDigit,
  onBackspace,
  onSetCents,
  onNext,
}: {
  photoUrl?: string
  reading: boolean
  readingLabel: string
  cents: number
  candidates: number[]
  onPick: () => void
  onDigit: (d: number) => void
  onBackspace: () => void
  onSetCents: (c: number) => void
  onNext: () => void
}) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center">
        <button
          onClick={onPick}
          className="relative mb-5 flex h-16 w-20 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
          aria-label="Trocar foto"
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={24} className="text-[var(--text-muted)]" />
          )}
          {reading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/35">
              <Loader2 size={20} className="animate-spin text-white" />
            </span>
          )}
        </button>

        <p className="mb-2 text-sm text-[var(--text-muted)]">
          {reading ? readingLabel : 'Confirme o valor'}
        </p>

        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-medium text-[var(--text-muted)]">R$</span>
          <span className="text-5xl font-medium tabular-nums tracking-tight">
            {formatCentsBR(cents)}
          </span>
        </div>

        {candidates.length > 1 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {candidates.map((c) => {
              const active = Math.round(c * 100) === cents
              return (
                <button
                  key={c}
                  onClick={() => onSetCents(Math.round(c * 100))}
                  className="press rounded-full border px-3 py-1.5 text-sm transition-colors"
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

      <Keypad onDigit={onDigit} onBackspace={onBackspace} />

      <button onClick={onNext} disabled={cents <= 0} className="btn-primary mt-4">
        Continuar
      </button>
    </>
  )
}

function Keypad({ onDigit, onBackspace }: { onDigit: (d: number) => void; onBackspace: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
        <KeyBtn key={k} onClick={() => onDigit(k)}>
          {k}
        </KeyBtn>
      ))}
      <span />
      <KeyBtn onClick={() => onDigit(0)}>0</KeyBtn>
      <KeyBtn onClick={onBackspace} action aria-label="Apagar">
        <Delete size={24} />
      </KeyBtn>
    </div>
  )
}

function KeyBtn({
  children,
  onClick,
  action,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  action?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      onClick={() => {
        haptic('light')
        onClick()
      }}
      aria-label={ariaLabel}
      className={`key${action ? ' key-action' : ''}`}
    >
      {children}
    </button>
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
      <p className="mb-6 mt-2 text-center text-base font-medium">Qual a categoria?</p>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ key, label, Icon }) => {
          const active = selected === key
          return (
            <button
              key={key}
              onClick={() => {
                haptic('light')
                onSelect(key)
              }}
              className="press flex h-24 flex-col items-center justify-center gap-2 rounded-xl border transition-colors"
              style={{
                borderColor: active ? 'var(--ink)' : 'var(--border)',
                backgroundColor: active ? 'var(--surface-2)' : 'var(--surface)',
              }}
            >
              <Icon size={24} className="text-[var(--text)]" />
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
  category,
  setCategory,
  advanced,
  setAdvanced,
  date,
  setDate,
  vendor,
  setVendor,
  description,
  setDescription,
  invoiceNumber,
  setInvoiceNumber,
  saving,
  onSave,
}: {
  paymentType: PaymentType | null
  setPaymentType: (p: PaymentType) => void
  category: Category | null
  setCategory: (c: Category) => void
  advanced: boolean
  setAdvanced: (v: boolean) => void
  date: string
  setDate: (v: string) => void
  vendor: string
  setVendor: (v: string) => void
  description: string
  setDescription: (v: string) => void
  invoiceNumber: string
  setInvoiceNumber: (v: string) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <p className="mb-6 mt-2 text-center text-base font-medium">Como você pagou?</p>

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

        <button
          onClick={() => setAdvanced(!advanced)}
          className="mt-3 flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3.5 text-sm text-[var(--text-muted)]"
        >
          <span>Avançado</span>
          <span className="flex items-center gap-2 text-xs">
            {!advanced && (category ? CATEGORY_LABELS[category] : formatDateBR(date))}
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
              <div className="pt-3">
                <Field label="Categoria">
                  <select
                    value={category ?? 'outros'}
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
                <Field label="Data">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                </Field>
                <Field label="Estabelecimento">
                  <input
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="Restaurante do aeroporto"
                    className="input"
                  />
                </Field>
                <Field label="Nº da nota (NF)">
                  <input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Opcional"
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button onClick={onSave} disabled={!paymentType || saving} className="btn-primary mt-4">
        {saving ? 'Salvando…' : 'Salvar despesa'}
      </button>
    </>
  )
}

