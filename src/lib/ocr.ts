export type Confidence = 'high' | 'medium' | 'low' | 'none'

export interface OcrGuess {
  amount?: number
  amountConfidence: Confidence
  /** valores distintos mais prováveis (para a UI oferecer como chips) */
  candidates: number[]
  date?: string // yyyy-mm-dd
  rawText: string
}

interface OcrWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}
interface OcrLine {
  text: string
  words: OcrWord[]
}

/* ---------- worker do Tesseract (singleton) ---------- */

let progressCb: ((p: number) => void) | null = null
let workerP: Promise<any> | null = null

function getWorker(): Promise<any> {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const worker = await createWorker('por', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && progressCb) progressCb(m.progress)
        },
      })
      // PSM 4: assume uma coluna de texto de tamanhos variados (recomendado p/ recibos)
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
      return worker
    })()
  }
  return workerP
}

export async function readReceipt(
  image: Blob,
  onProgress?: (p: number) => void,
): Promise<OcrGuess> {
  const input = await preprocess(image)
  const worker = await getWorker()

  progressCb = onProgress ?? null
  let data: any
  try {
    const res = await worker.recognize(input, {}, { blocks: true, text: true })
    data = res.data
  } finally {
    progressCb = null
  }

  const text: string = data?.text || ''
  const lines = flattenLines(data)
  const amount = lines.length ? amountFromLines(lines) : amountFromText(text)

  return {
    amount: amount.value,
    amountConfidence: amount.confidence,
    candidates: amount.candidates,
    date: guessDate(text),
    rawText: text,
  }
}

function flattenLines(data: any): OcrLine[] {
  const out: OcrLine[] = []
  for (const b of data?.blocks ?? []) {
    for (const p of b?.paragraphs ?? []) {
      for (const l of p?.lines ?? []) {
        const words: OcrWord[] = (l?.words ?? []).map((w: any) => ({
          text: String(w?.text ?? ''),
          confidence: Number(w?.confidence ?? 0),
          bbox: w?.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
        }))
        out.push({ text: String(l?.text ?? words.map((w) => w.text).join(' ')), words })
      }
    }
  }
  return out
}

/* ---------- pré-processamento ---------- */

/**
 * Realça a imagem para OCR: upscale, remove tinta colorida (caneta azul/vermelha
 * vira branco — prioriza o impresso preto) e normaliza o contraste.
 */
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

    const id = ctx.getImageData(0, 0, w, h)
    const px = id.data
    const hist = new Uint32Array(256)

    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]
      const g = px[i + 1]
      const b = px[i + 2]
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      // pixel colorido (caneta) e não muito escuro -> vira branco (some)
      let gray: number
      if (mx - mn > 45 && mx > 60) {
        gray = 255
      } else {
        gray = (r * 0.299 + g * 0.587 + b * 0.114) | 0
      }
      px[i] = px[i + 1] = px[i + 2] = gray
      hist[gray]++
    }

    // contraste: estica entre os percentis 2% e 98%
    const total = w * h
    const lo = percentile(hist, total, 0.02)
    const hi = percentile(hist, total, 0.98)
    if (hi > lo) {
      const span = hi - lo
      for (let i = 0; i < px.length; i += 4) {
        let v = ((px[i] - lo) * 255) / span
        v = v < 0 ? 0 : v > 255 ? 255 : v
        px[i] = px[i + 1] = px[i + 2] = v
      }
    }

    ctx.putImageData(id, 0, 0)
    return canvas
  } catch {
    return blob
  }
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= target) return i
  }
  return 255
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

const MONEY_RE = /(?:^|\D)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/g
const TOTAL_RE = /\b(total|a\s*pagar|a\s*receber|recebido|l[ií]quido)\b/i
const NOT_TOTAL_RE = /\b(sub-?total|desconto|troco|qtd|quant|pe[cç]as|itens|unit)\b/i
const MIN_WORD_CONF = 30

interface AmountResult {
  value?: number
  confidence: Confidence
  candidates: number[]
}

/** Usa palavras + confiança + posição (bbox) — descarta manuscrito (confiança baixa). */
function amountFromLines(lines: OcrLine[]): AmountResult {
  const cands: { value: number; score: number; onTotal: boolean }[] = []

  for (const line of lines) {
    const isTotal = TOTAL_RE.test(line.text) && !NOT_TOTAL_RE.test(line.text)
    let labelRight = -1
    if (isTotal) {
      for (const w of line.words) if (TOTAL_RE.test(w.text)) labelRight = Math.max(labelRight, w.bbox.x1)
    }
    for (const w of line.words) {
      const value = parseMoney(w.text)
      if (value == null || w.confidence < MIN_WORD_CONF) continue
      let score = w.confidence
      if (isTotal) score += 1000
      if (labelRight >= 0 && w.bbox.x0 >= labelRight) score += 300
      cands.push({ value, score, onTotal: isTotal })
    }
  }

  if (cands.length === 0) return { confidence: 'none', candidates: [] }

  // bônus por repetição (TOTAL/A RECEBER/RECEBIDO iguais) e melhor score por valor
  const freq = new Map<number, number>()
  for (const c of cands) freq.set(c.value, (freq.get(c.value) ?? 0) + 1)
  const bestByValue = new Map<number, number>()
  for (const c of cands) {
    const s = c.score + ((freq.get(c.value) ?? 1) - 1) * 60
    bestByValue.set(c.value, Math.max(bestByValue.get(c.value) ?? 0, s))
  }

  const sorted = [...bestByValue.entries()].sort((a, b) => b[1] - a[1])
  const value = sorted[0][0]
  const topScore = sorted[0][1]
  const onTotal = topScore >= 1000
  const repeated = (freq.get(value) ?? 0) >= 2

  let confidence: Confidence
  if (onTotal && (repeated || topScore >= 1070)) confidence = 'high'
  else if (onTotal || topScore >= 80) confidence = 'medium'
  else confidence = 'low'

  return { value, confidence, candidates: sorted.slice(0, 4).map((e) => e[0]) }
}

/** Fallback por texto (quando não há palavras/bbox). */
function amountFromText(text: string): AmountResult {
  const totals: number[] = []
  const others: number[] = []
  for (const line of text.split(/\r?\n/)) {
    const isTotal = TOTAL_RE.test(line) && !NOT_TOTAL_RE.test(line)
    MONEY_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = MONEY_RE.exec(line)) !== null) {
      const v = Number(`${m[1].replace(/\./g, '')}.${m[2]}`)
      if (!Number.isNaN(v) && v > 0) (isTotal ? totals : others).push(v)
    }
  }
  const distinct = (arr: number[]) => [...new Set(arr)]
  if (totals.length) {
    return { value: mostFrequent(totals), confidence: 'high', candidates: distinct([...totals, ...others]).slice(0, 4) }
  }
  if (others.length) {
    const sorted = distinct(others).sort((a, b) => b - a)
    return { value: sorted[0], confidence: 'low', candidates: sorted.slice(0, 4) }
  }
  return { confidence: 'none', candidates: [] }
}

/** Extrai um valor monetário BR de um token (rejeita código de barras). */
function parseMoney(token: string): number | null {
  MONEY_RE.lastIndex = 0
  const m = MONEY_RE.exec(token)
  if (!m) return null
  const v = Number(`${m[1].replace(/\./g, '')}.${m[2]}`)
  return Number.isNaN(v) || v <= 0 ? null : v
}

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

export function guessDate(text: string): string | undefined {
  const now = new Date()
  const maxTime = now.getTime() + 2 * 86400_000
  const minTime = now.getTime() - 3 * 365 * 86400_000
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
