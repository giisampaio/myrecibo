import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { haptic } from '../lib/haptics'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function iso(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Calendário único de intervalo: primeiro toque marca o início, segundo o fim
 * (toque antes do início recomeça a seleção). Feito para dedo (células ≥40px).
 */
export default function RangeCalendar({
  start,
  end,
  onChange,
}: {
  start: string
  end: string | null
  onChange: (start: string, end: string | null) => void
}) {
  const [view, setView] = useState(() => {
    const [y, m] = start.split('-').map(Number)
    return { year: y, month0: m - 1 }
  })

  const first = new Date(view.year, view.month0, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(view.year, view.month0 + 1, 0).getDate()
  const label = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  function shift(delta: number) {
    const d = new Date(view.year, view.month0 + delta, 1)
    setView({ year: d.getFullYear(), month0: d.getMonth() })
  }

  function pick(day: number) {
    haptic('light')
    const date = iso(view.year, view.month0, day)
    if (!end && date >= start) onChange(start, date) // completa o intervalo
    else onChange(date, null) // (re)começa a seleção
  }

  const cells: (number | null)[] = [
    ...Array<null>(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="icon-btn -ml-2.5" aria-label="Mês anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium capitalize">{label}</span>
        <button onClick={() => shift(1)} className="icon-btn -mr-2.5" aria-label="Próximo mês">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-[10px] font-medium text-[var(--text-muted)]">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`v${i}`} />
          const date = iso(view.year, view.month0, day)
          const isStart = date === start
          const isEnd = date === (end ?? start)
          const inRange = end !== null && date > start && date < end
          const edge = isStart || isEnd
          return (
            <button
              key={date}
              onClick={() => pick(day)}
              aria-pressed={edge}
              className="press mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm tabular-nums"
              style={{
                backgroundColor: edge
                  ? 'var(--ink)'
                  : inRange
                    ? 'color-mix(in srgb, var(--ink) 12%, transparent)'
                    : 'transparent',
                color: edge ? 'var(--ink-contrast)' : 'var(--text)',
                fontWeight: edge ? 600 : 400,
              }}
            >
              {day}
            </button>
          )
        })}
      </div>

      <p className="mt-1 text-center text-[11px] text-[var(--text-muted)]">
        {end === null ? 'Agora toque no fim do período' : 'Toque num dia para recomeçar'}
      </p>
    </div>
  )
}
