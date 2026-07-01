import { useEffect } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export interface ToastData {
  message: string
  kind: 'success' | 'error'
}

/**
 * Aviso flutuante autodescartável (sucesso/erro). O pai controla via state:
 * `const [toast, setToast] = useState<ToastData | null>(null)` e renderiza
 * `<Toast toast={toast} onDone={() => setToast(null)} />`.
 */
export default function Toast({
  toast,
  onDone,
}: {
  toast: ToastData | null
  onDone: () => void
}) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, toast.kind === 'error' ? 5000 : 2600)
    return () => clearTimeout(t)
  }, [toast, onDone])

  if (!toast) return null
  const Icon = toast.kind === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div
      role="status"
      className="fixed inset-x-4 z-50 flex justify-center"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <div className="flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-3 pr-4 shadow-lg">
        <Icon
          size={18}
          className={toast.kind === 'success' ? 'text-[var(--status-pago)]' : 'text-[var(--danger)]'}
        />
        <span className="truncate text-sm font-medium">{toast.message}</span>
      </div>
    </div>
  )
}
