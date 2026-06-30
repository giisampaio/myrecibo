import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import type { GeneratedReceipt, ReceiptTemplate } from '../types'
import { formatBRL, formatDateBR } from './format'

export interface ReceiptData extends GeneratedReceipt {
  amount: number
  date: string
}

const THEMES: Record<ReceiptTemplate, { bar: [number, number, number]; accent: [number, number, number] }> = {
  classico: { bar: [0.12, 0.25, 0.46], accent: [0.12, 0.25, 0.46] },
  moderno: { bar: [0.02, 0.59, 0.69], accent: [0.02, 0.59, 0.69] },
  minimalista: { bar: [0.1, 0.1, 0.12], accent: [0.45, 0.45, 0.5] },
}

const NUM_EXT = valorPorExtenso

/** Desenha um recibo (página A4) usando os dados informados. */
export async function drawReceiptPage(
  pdf: PDFDocument,
  data: ReceiptData,
  font: PDFFont,
  fontBold: PDFFont,
): Promise<PDFPage> {
  const page = pdf.addPage([595, 842])
  const { width, height } = page.getSize()
  const theme = THEMES[data.template]
  const bar = rgb(...theme.bar)
  const accent = rgb(...theme.accent)
  const dark = rgb(0.1, 0.12, 0.16)
  const muted = rgb(0.4, 0.43, 0.5)

  const margin = 50
  const isMinimal = data.template === 'minimalista'

  // Cabeçalho
  if (isMinimal) {
    page.drawText('RECIBO', { x: margin, y: height - 80, size: 30, font: fontBold, color: dark })
    page.drawLine({
      start: { x: margin, y: height - 95 },
      end: { x: width - margin, y: height - 95 },
      thickness: 2,
      color: bar,
    })
  } else {
    page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: bar })
    page.drawText('RECIBO', { x: margin, y: height - 70, size: 28, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText(formatBRL(data.amount), {
      x: width - margin - fontBold.widthOfTextAtSize(formatBRL(data.amount), 22),
      y: height - 70,
      size: 22,
      font: fontBold,
      color: rgb(1, 1, 1),
    })
  }

  let y = height - 160

  if (isMinimal) {
    page.drawText(formatBRL(data.amount), { x: margin, y, size: 24, font: fontBold, color: dark })
    y -= 40
  }

  // Corpo do recibo
  const body =
    `Recebi de ${data.payerName || '—'}${data.payerDoc ? ` (${data.payerDoc})` : ''} ` +
    `a importância de ${formatBRL(data.amount)} (${NUM_EXT(data.amount)}), ` +
    `referente a ${data.refersTo || '—'}.`

  for (const line of wrap(body, font, 12, width - margin * 2)) {
    page.drawText(line, { x: margin, y, size: 12, font, color: dark })
    y -= 20
  }

  y -= 30
  page.drawText(`${data.city || '—'}, ${formatDateBR(data.date)}.`, {
    x: margin,
    y,
    size: 12,
    font,
    color: dark,
  })

  // Assinatura
  y -= 80
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + 250, y },
    thickness: 1,
    color: accent,
  })
  page.drawText(data.issuerName || 'Emitente', {
    x: margin,
    y: y - 16,
    size: 11,
    font: fontBold,
    color: dark,
  })
  if (data.issuerDoc) {
    page.drawText(data.issuerDoc, { x: margin, y: y - 32, size: 10, font, color: muted })
  }

  return page
}

export async function buildReceiptPDF(data: ReceiptData): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  await drawReceiptPage(pdf, data, font, fontBold)
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (line) lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Valor por extenso em reais (simplificado, suficiente para recibos). */
export function valorPorExtenso(value: number): string {
  const reais = Math.floor(value)
  const centavos = Math.round((value - reais) * 100)
  let out = `${extenso(reais)} ${reais === 1 ? 'real' : 'reais'}`
  if (centavos > 0) out += ` e ${extenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`
  return out
}

function extenso(n: number): string {
  if (n === 0) return 'zero'
  if (n === 100) return 'cem'
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const d10 = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

  const parts: string[] = []
  if (n >= 1000) {
    const milhar = Math.floor(n / 1000)
    parts.push(milhar === 1 ? 'mil' : `${extenso(milhar)} mil`)
    n %= 1000
    if (n === 0) return parts.join(' ')
  }
  if (n >= 100) {
    parts.push(c[Math.floor(n / 100)])
    n %= 100
  }
  if (n >= 20) {
    const dez = d[Math.floor(n / 10)]
    n %= 10
    parts.push(n > 0 ? `${dez} e ${u[n]}` : dez)
  } else if (n >= 10) {
    parts.push(d10[n - 10])
  } else if (n > 0) {
    parts.push(u[n])
  }
  return parts.filter(Boolean).join(' e ')
}
