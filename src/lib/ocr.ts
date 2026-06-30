export interface OcrGuess {
  amount?: number
  date?: string // yyyy-mm-dd
  rawText: string
}

/**
 * Lê uma imagem de comprovante e tenta extrair valor e data.
 * Tudo opcional: se falhar, o usuário preenche na mão.
 *
 * Obs.: por padrão o Tesseract baixa o modelo de idioma na 1ª vez.
 * Para uso 100% offline, os assets podem ser hospedados localmente
 * (ver README — etapa de bundling do OCR).
 */
export async function readReceipt(
  image: Blob,
  onProgress?: (p: number) => void,
): Promise<OcrGuess> {
  // Carrega o Tesseract sob demanda (só ao fotografar) — app abre mais rápido
  const { default: Tesseract } = await import('tesseract.js')
  const { data } = await Tesseract.recognize(image, 'por', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  const text = data.text || ''
  return {
    amount: guessAmount(text),
    date: guessDate(text),
    rawText: text,
  }
}

/** Procura o maior valor monetário próximo de palavras como "total". */
export function guessAmount(text: string): number | undefined {
  const lines = text.split(/\r?\n/)
  const moneyRe = /(\d{1,3}(?:[.\s]\d{3})*|\d+)[,.](\d{2})\b/g

  const candidates: { value: number; weighted: boolean }[] = []
  for (const line of lines) {
    const isTotal = /total|valor|vlr|pagar|liquido|líquido/i.test(line)
    let m: RegExpExecArray | null
    moneyRe.lastIndex = 0
    while ((m = moneyRe.exec(line)) !== null) {
      const intPart = m[1].replace(/[.\s]/g, '')
      const value = Number(`${intPart}.${m[2]}`)
      if (!Number.isNaN(value) && value > 0) {
        candidates.push({ value, weighted: isTotal })
      }
    }
  }
  if (candidates.length === 0) return undefined
  const totals = candidates.filter((c) => c.weighted)
  const pool = totals.length > 0 ? totals : candidates
  return pool.reduce((max, c) => (c.value > max ? c.value : max), 0)
}

/** Procura uma data no formato dd/mm/aaaa (ou dd/mm/aa). */
export function guessDate(text: string): string | undefined {
  const m = text.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{2,4})\b/)
  if (!m) return undefined
  const day = m[1]
  const month = m[2]
  let year = m[3]
  if (year.length === 2) year = `20${year}`
  const d = Number(day)
  const mo = Number(month)
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined
  return `${year}-${month}-${day}`
}
