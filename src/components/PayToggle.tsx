import { Check, type LucideIcon } from 'lucide-react'
import { haptic } from '../lib/haptics'

/** Cartão de forma de pagamento (Corporativo/Pessoal) — visual único no app. */
export default function PayToggle({
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
      onClick={() => {
        haptic('light')
        onClick()
      }}
      className="press relative flex h-24 flex-col items-center justify-center gap-2 rounded-xl border transition-colors"
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
      <Icon size={26} className="text-[var(--text)]" />
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
    </button>
  )
}
