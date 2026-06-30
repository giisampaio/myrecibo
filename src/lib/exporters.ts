import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx'
import {
  CATEGORY_LABELS,
  PAYMENT_LABELS,
  type Expense,
} from '../types'
import { formatBRL, formatDateBR } from './format'
import { drawReceiptPage } from './receipt'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Gera um PDF com uma capa-resumo e uma página por comprovante fotografado.
 */
export async function exportReceiptsPDF(expenses: Expense[], monthLabel: string) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Capa / resumo
  const cover = pdf.addPage([595, 842]) // A4
  const { width, height } = cover.getSize()
  cover.drawText('Relatório de Despesas', {
    x: 40,
    y: height - 60,
    size: 22,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  })
  cover.drawText(monthLabel, { x: 40, y: height - 85, size: 12, font })

  let y = height - 130
  cover.drawText('Data', { x: 40, y, size: 9, font: fontBold })
  cover.drawText('Estabelecimento', { x: 110, y, size: 9, font: fontBold })
  cover.drawText('Categoria', { x: 300, y, size: 9, font: fontBold })
  cover.drawText('Forma', { x: 400, y, size: 9, font: fontBold })
  cover.drawText('Valor', { x: 500, y, size: 9, font: fontBold })
  y -= 6
  cover.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5 })
  y -= 14

  let total = 0
  for (const e of expenses) {
    if (y < 60) {
      y = height - 60
      pdf.addPage([595, 842])
    }
    total += e.amount
    cover.drawText(formatDateBR(e.date), { x: 40, y, size: 9, font })
    cover.drawText(trunc(e.vendor || '—', 32), { x: 110, y, size: 9, font })
    cover.drawText(CATEGORY_LABELS[e.category], { x: 300, y, size: 9, font })
    cover.drawText(PAYMENT_LABELS[e.paymentType], { x: 400, y, size: 9, font })
    cover.drawText(formatBRL(e.amount), { x: 500, y, size: 9, font })
    y -= 16
  }
  y -= 6
  cover.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5 })
  y -= 18
  cover.drawText(`Total: ${formatBRL(total)}`, { x: 400, y, size: 12, font: fontBold })

  // Uma página por comprovante
  for (const e of expenses) {
    // Recibo manual gerado: desenha a página a partir dos dados
    if (!e.photo && e.source === 'recibo' && e.receipt) {
      await drawReceiptPage(pdf, { ...e.receipt, amount: e.amount, date: e.date }, font, fontBold)
      continue
    }
    if (!e.photo) continue
    const bytes = new Uint8Array(await e.photo.arrayBuffer())
    let img
    try {
      img = e.photo.type.includes('png')
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes)
    } catch {
      continue
    }
    const page = pdf.addPage([595, 842])
    page.drawText(
      `${formatDateBR(e.date)} · ${e.vendor || CATEGORY_LABELS[e.category]} · ${formatBRL(e.amount)} · ${PAYMENT_LABELS[e.paymentType]}`,
      { x: 40, y: 800, size: 10, font: fontBold },
    )
    const maxW = 515
    const maxH = 720
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    page.drawImage(img, { x: (595 - w) / 2, y: 770 - h, width: w, height: h })
  }

  const blob = new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
  download(blob, `comprovantes-${monthLabel.replace(/\s+/g, '-')}.pdf`)
}

/**
 * Exporta a planilha de despesas. As colunas seguem um modelo padrão;
 * serão ajustadas para o modelo oficial do financeiro.
 */
export function exportXLSX(expenses: Expense[], monthLabel: string) {
  const rows = expenses.map((e) => ({
    Data: formatDateBR(e.date),
    Estabelecimento: e.vendor,
    Categoria: CATEGORY_LABELS[e.category],
    'Forma de Pagamento': PAYMENT_LABELS[e.paymentType],
    Valor: e.amount,
    Reembolso: e.paymentType === 'pessoal' ? 'Sim' : 'Não',
    Observação: e.description,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas')
  XLSX.writeFile(wb, `despesas-${monthLabel.replace(/\s+/g, '-')}.xlsx`)
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
