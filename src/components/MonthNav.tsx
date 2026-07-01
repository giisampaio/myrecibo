import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Navegação de mês (‹ Mês De Ano ›) — mesma em Despesas e Relatório. */
export default function MonthNav({
  label,
  onPrev,
  onNext,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <button onClick={onPrev} className="icon-btn -ml-2.5" aria-label="Mês anterior">
        <ChevronLeft size={20} />
      </button>
      <span className="font-medium capitalize">{label}</span>
      <button onClick={onNext} className="icon-btn -mr-2.5" aria-label="Próximo mês">
        <ChevronRight size={20} />
      </button>
    </div>
  )
}
