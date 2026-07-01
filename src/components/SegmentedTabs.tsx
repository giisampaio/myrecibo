/** Abas segmentadas (pílula) — padrão único de alternância entre visões. */
export default function SegmentedTabs<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[]
  value: K
  onChange: (k: K) => void
}) {
  return (
    <div
      className="mb-5 grid gap-1 rounded-xl bg-[var(--surface-2)] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className="press rounded-lg py-2 text-sm font-medium"
            style={{
              backgroundColor: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
