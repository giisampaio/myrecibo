import type { ReactNode } from 'react'

/** Rótulo + controle de formulário — padrão único de campo em todas as telas. */
export default function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}
