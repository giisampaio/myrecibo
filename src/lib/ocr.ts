export type Confidence = 'high' | 'low' | 'none'

export interface OcrGuess {
  amount?: number
  /** high = veio de uma linha de TOTAL confiável; low = palpite fraco */
  amountConfidence: Confidence
  date?: string // yyyy-mm-dd
  rawText: string
}

/**
 * Lê uma imagem de comprovante e tenta extrair valor e data.
 * Tudo opcional: o valor só é considerado confiável quando vem de uma linha
 * de TOTAL (o chamador só preenche nesse caso).
 *
 * Obs.: por padrão o Tesseract baixa o modelo de idioma na 1ª vez.
 */
export async function readReceipt(
  image: Blob,
  onProgress?: (p: number) => void,
): Promise<OcrGuess> {
  // Pré-processa (cinza + upscale) para ajudar a leitura dos dígitos
  const input = await preprocess(image)

  const { default: Tesseract } = await import('tesseract.js')
  const { data } = await Tesseract.recognize(input, 'por', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  const text = data.text || ''
  const amount = guessAmount(text)
  return {
    amount: amount.value,
    amountConfidence: amount.confidence,
    date: guessDate(text),
    rawText: text,
  }
}

/* ---------- pré-processamento ---------- */

async function preprocess(blob: Blob): Promise<HTMLCanvasElement | Blob> {
  try {
    const img = await loadImage(blob)
    const MIN_W = 1500
    const MAX_W = 2400
    let scale = 1
    if (img.naturalWidth < MIN_W) scale = MIN_W / img.naturalWidth
    if (img.naturalWidth * scale > MAX_W) scale = MAX_W / img.naturalWidth
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(img, 0, 0, w, h)

    // Escala de cinza (reduz ruído de cor e ajuda o OCR)
    const id = ctx.getImageData(0, 0, w, h)
    const px = id.data
    for (let i = 0; i < px.length; i += 4) {
      const g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
      px[i] = px[i + 1] = px[i + 2] = g
    }
    ctx.putImageData(id, 0, 0)
    return canvas
  } catch {
    return blob
  }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('imagem inválida'))
    }
    img.src = url
  })
}

/* ---------- extração do valor ---------- */

// Valor no formato BR (1.234,56). (?:^|\D) e (?!\d) evitam pegar fragmentos
// de código de barras / dígitos colados.
const MONEY_RE = /(?:^|\D)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/g

const TOTAL_RE = /\b(total|a\s*pagar|a\s*receber|recebido|l[ií]quido)\b/i
const NOT_TOTAL_RE = /\b(sub-?total|desconto|troco|qtd|quant|pe[cç]as|itens|unit)\b/i

export function guessAmount(text: string): { value?: number; confidence: Confidence } {
  const totals: number[] = []
  const others: number[] = []

  for (const line of text.split(/\r?\n/)) {
    const isTotalLine = TOTAL_RE.test(line) && !NOT_TOTAL_RE.test(line)
    MONEY_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = MONEY_RE.exec(line)) !== null) {
      const value = Number(`${m[1].replace(/\./g, '')}.${m[2]}`)
      if (Number.isNaN(value) || value <= 0) continue
      ;(isTotalLine ? totals : others).push(value)
    }
  }

  if (totals.length > 0) {
    return { value: mostFrequent(totals), confidence: 'high' }
  }
  if (others.length > 0) {
    return { value: Math.max(...others), confidence: 'low' }
  }
  return { confidence: 'none' }
}

/** Valor que mais se repete; empate desempata pelo maior. */
function mostFrequent(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v > best)) {
      best = v
      bestCount = c
    }
  }
  return best
}

/* ---------- extração da data ---------- */

const DATE_RE = /(?:^|\D)(\d{2})[/.\-](\d{2})[/.\-](\d{2,4})(?!\d)/g
const DATE_HINT_RE = /\b(data|dt|emiss\w*)/gi

/**
 * Procura uma data plausível (dd/mm/aaaa). Prefere a que vem logo após um
 * rótulo "DATA/DT/EMISSÃO"; senão usa a primeira data sã encontrada.
 */
export function guessDate(text: string): string | undefined {
  const now = new Date()
  const maxTime = now.getTime() + 2 * 86400_000 // até hoje+2 dias
  const minTime = now.getTime() - 3 * 365 * 86400_000 // até ~3 anos atrás

  let fallback: string | undefined

  for (const line of text.split(/\r?\n/)) {
    const hintEnds: number[] = []
    DATE_HINT_RE.lastIndex = 0
    let h: RegExpExecArray | null
    while ((h = DATE_HINT_RE.exec(line)) !== null) hintEnds.push(h.index + h[0].length)

    let bestHinted: { iso: string; gap: number } | undefined

    DATE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = DATE_RE.exec(line)) !== null) {
      const iso = toIso(m[1], m[2], m[3])
      if (!iso) continue
      const t = new Date(`${iso}T12:00:00`).getTime()
      if (Number.isNaN(t) || t > maxTime || t < minTime) continue

      // menor distância até um rótulo de data que venha ANTES desta data
      let gap = Infinity
      for (const he of hintEnds) if (he <= m.index && m.index - he < gap) gap = m.index - he

      if (gap <= 8) {
        if (!bestHinted || gap < bestHinted.gap) bestHinted = { iso, gap }
      } else if (!fallback) {
        fallback = iso
      }
    }
    if (bestHinted) return bestHinted.iso
  }
  return fallback
}

function toIso(dd: string, mm: string, yy: string): string | undefined {
  const day = Number(dd)
  const month = Number(mm)
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined
  const year = yy.length === 2 ? `20${yy}` : yy
  return `${year}-${mm}-${dd}`
}
