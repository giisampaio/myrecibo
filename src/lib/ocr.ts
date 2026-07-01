import type { Category } from '../types'

export type Confidence = 'high' | 'medium' | 'low' | 'none'

export interface OcrGuess {
  amount?: number
  amountConfidence: Confidence
  /** valores distintos mais prováveis (para a UI oferecer como chips) */
  candidates: number[]
  date?: string // yyyy-mm-dd
  /** categoria detectada pelo texto (null = não identificou) */
  category: Category | null
  /** palpite do nome do estabelecimento (topo do cupom) */
  vendor?: string
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

/* ---------- motor PaddleOCR (PP-OCRv6 via ONNX Runtime, singleton) ---------- */
// Modelos auto-hospedados em public/ocr/ (~30 MB, baixados uma vez e cacheados
// pelo service worker — mesmo padrão do OpenCV). Muito mais preciso que o
// Tesseract em cupom térmico/foto de celular.

let serviceP: Promise<any> | null = null
let ready = false

function getService(): Promise<any> {
  if (!serviceP) {
    serviceP = (async () => {
      // WASM do ONNX auto-hospedado em produção (senão a lib cai num CDN
      // externo). No dev fica o CDN: o Vite não deixa importar módulo de
      // public/ durante o desenvolvimento.
      if (import.meta.env.PROD) {
        const ort = await import('onnxruntime-web')
        if (!ort.env.wasm.wasmPaths) ort.env.wasm.wasmPaths = '/ort/'
      }
      const { PaddleOcrService } = await import('ppu-paddle-ocr/web')
      const service = new PaddleOcrService({
        model: {
          detection: '/ocr/det.ort',
          recognition: '/ocr/rec.ort',
          charactersDictionary: '/ocr/dict.txt',
        },
      })
      await service.initialize()
      ready = true
      return service
    })()
    // Falhou (rede/WASM)? Zera para tentar de novo na próxima foto.
    serviceP.catch(() => {
      serviceP = null
    })
  }
  return serviceP
}

/** Começa a baixar/inicializar o leitor em segundo plano (ex.: ao abrir o
 *  scanner) — quando a foto sair, o OCR já está de pé. */
export function warmupOcr(): void {
  getService().catch(() => {})
}

/** true quando os modelos já estão carregados (leitura será rápida). */
export function isOcrReady(): boolean {
  return ready
}

export async function readReceipt(image: Blob): Promise<OcrGuess> {
  const input = await preprocess(image)
  const buf = await input.arrayBuffer()
  const service = await getService()

  const res = await service.recognize(buf)
  const lines = mapLines(res)
  const text: string = res?.text || lines.map((l) => l.text).join('\n')
  const amount = lines.length ? amountFromLines(lines) : amountFromText(text)

  return {
    amount: amount.value,
    amountConfidence: amount.confidence,
    candidates: amount.candidates,
    date: guessDate(text),
    category: guessCategory(text),
    vendor: guessVendor(lines),
    rawText: text,
  }
}

/** Converte o resultado do PP-OCR (linhas de itens com box + confiança 0–1)
 *  para o formato interno (confiança 0–100, bbox x0/y0/x1/y1). */
function mapLines(res: any): OcrLine[] {
  const out: OcrLine[] = []
  for (const line of res?.lines ?? []) {
    const words: OcrWord[] = (line ?? []).map((item: any) => ({
      text: String(item?.text ?? ''),
      confidence: Number(item?.confidence ?? 0) * 100,
      bbox: {
        x0: Number(item?.box?.x ?? 0),
        y0: Number(item?.box?.y ?? 0),
        x1: Number(item?.box?.x ?? 0) + Number(item?.box?.width ?? 0),
        y1: Number(item?.box?.y ?? 0) + Number(item?.box?.height ?? 0),
      },
    }))
    if (words.length) out.push({ text: words.map((w) => w.text).join(' '), words })
  }
  return out
}

/* ---------- estabelecimento (topo do cupom) ---------- */

const NOT_VENDOR_RE =
  /\b(cnpj|cpf|i\.?e\.?[:.]|insc|nfc-?e|nf-?e|cupom|fiscal|extrato|documento|sat\b|via\s+do|consumidor|rua\b|av\.|avenida|fone|tel|cep\b|www\.|http)/i

/** Primeira linha "com cara de nome" entre as primeiras do cupom.
 *  Só troca por uma linha de baixo se ela for bem maior (nome em destaque). */
function guessVendor(lines: OcrLine[]): string | undefined {
  const top = lines.slice(0, 5)
  let best: { text: string; height: number } | undefined
  for (const line of top) {
    const t = line.text.trim()
    if (t.length < 4 || t.length > 40) continue
    if (NOT_VENDOR_RE.test(t)) continue
    if (/^\d+\s*x\b/i.test(t)) continue // linha de item (1x ...)
    if (parseMoney(t) != null) continue // linha com valor
    const letters = (t.match(/\p{L}/gu) ?? []).length
    if (letters / t.length < 0.55) continue
    const height = Math.max(...line.words.map((w) => w.bbox.y1 - w.bbox.y0), 0)
    if (!best) best = { text: t, height }
    else if (height > best.height * 1.3) best = { text: t, height }
  }
  return best?.text
}

/* ---------- categoria por palavras-chave ---------- */

const CATEGORY_KEYWORDS: { cat: Category; re: RegExp }[] = [
  {
    cat: 'transporte',
    re: /\b(uber|99\s?pop|99\s?app|t[aá]xi|taxi|posto|combust|gasolina|etanol|[aá]lcool|diesel|estacionamento|ped[aá]gio|passagem|locadora|loca[çc][aã]o|transporte)\b/i,
  },
  {
    cat: 'hospedagem',
    re: /\b(hotel|pousada|hospedagem|di[aá]ria|hostel|airbnb|resort|flat|motel)\b/i,
  },
  {
    cat: 'comissaria',
    re: /\b(comissaria|comiss[aá]ria|catering|bordo|tripula)\b/i,
  },
  {
    cat: 'impressao',
    re: /\b(impress|gr[aá]fica|c[oó]pia|copia|xerox|papelaria|plotagem)\b/i,
  },
  {
    cat: 'peca',
    re: /\b(pe[çc]a|auto.?pe[çc]a|parafuso|ferramenta|manuten[çc]|oficina|mec[aâ]nic)\b/i,
  },
  {
    cat: 'alimentacao',
    re: /\b(restaurante|lanchonete|lanche|padaria|pizza|burger|hamburg|food|churrasc|espetinho|a[çc]ougue|carne|merc(ado|earia)|superm|caf[eé]|bebida|refei[çc]|bar|bistr[oô]|sushi)\b/i,
  },
]

/** Detecta a categoria pelo texto do comprovante; null se não identificar. */
export function guessCategory(text: string): Category | null {
  for (const { cat, re } of CATEGORY_KEYWORDS) if (re.test(text)) return cat
  return null
}

/* ---------- pré-processamento ---------- */

/**
 * Só reduz fotos gigantes (câmera sem recorte). O PP-OCR trabalha melhor com
 * a imagem colorida natural — nada de filtro de tinta/contraste (isso era
 * muleta do Tesseract e ainda apagava valores escritos à caneta, que em
 * cupom manual são o total de verdade). JPEG: encode bem mais rápido que PNG.
 */
const MAX_SIDE = 1600

async function preprocess(blob: Blob): Promise<Blob> {
  try {
    const img = await loadImage(blob)
    const side = Math.max(img.naturalWidth, img.naturalHeight)
    if (side <= MAX_SIDE) return blob

    const scale = MAX_SIDE / side
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.85),
    )
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
