import { REIMBURSEMENT_LABELS, type ReimbursementStatus } from '../types'

/**
 * Badge de status do reembolso — exibição em listas (a edição é sempre pelo
 * controle segmentado no detalhe). Cores vêm dos tokens --status-* do tema.
 */
export default function StatusBadge({ status }: { status: ReimbursementStatus }) {
  if (status === 'na') return null
  const color = `var(--status-${status})`
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {REIMBURSEMENT_LABELS[status]}
    </span>
  )
}
