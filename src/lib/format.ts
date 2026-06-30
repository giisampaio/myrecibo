export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** Converte texto digitado ("1.234,56" ou "1234.56") em número. */
export function parseBRL(input: string): number {
  const cleaned = input
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove separador de milhar
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isNaN(n) ? 0 : n
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function todayISO(): string {
  const now = new Date()
  const off = now.getTimezoneOffset()
  const local = new Date(now.getTime() - off * 60_000)
  return local.toISOString().slice(0, 10)
}
