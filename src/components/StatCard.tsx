/** Cartão de resumo (rótulo + valor) — mesmo visual em Despesas e Relatório. */
export default function StatCard({
  label,
  value,
  big,
}: {
  label: string
  value: string
  big?: boolean
}) {
  return (
    <div className={`rounded-xl bg-[var(--surface-2)] ${big ? 'p-4' : 'p-3'}`}>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={`mt-0.5 font-medium ${big ? 'text-2xl' : 'text-lg'}`}>{value}</div>
    </div>
  )
}
