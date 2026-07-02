import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { CATEGORY_LABELS, PAYMENT_LABELS, type Expense } from '../types'
import type { Profile } from './profile'
import { formatBRL, formatDateBR } from './format'
import { fillReportXlsx, SCHEFFER_TEMPLATE } from './reportEngine'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Entrega o arquivo do jeito certo por plataforma: no iPhone (PWA) abre o
 * Share Sheet nativo (WhatsApp/Mail/Arquivos); no desktop baixa direto.
 */
async function deliver(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      // Cancelar o share não é erro; qualquer outra falha cai no download
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  download(blob, filename)
}

/** Gera um PDF com capa-resumo e uma página por comprovante. */
export async function exportReceiptsPDF(expenses: Expense[], monthLabel: string, titulo?: string) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const cover = pdf.addPage([595, 842])
  const { width, height } = cover.getSize()
  cover.drawText(titulo ? `Comprovantes — ${titulo}` : 'Relatório de Despesas', {
    x: 40,
    y: height - 60,
    size: 20,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  })
  cover.drawText(monthLabel, { x: 40, y: height - 85, size: 12, font })

  let y = height - 130
  cover.drawText('Data', { x: 40, y, size: 9, font: fontBold })
  cover.drawText('Nº NF', { x: 95, y, size: 9, font: fontBold })
  cover.drawText('Estabelecimento', { x: 150, y, size: 9, font: fontBold })
  cover.drawText('Categoria', { x: 350, y, size: 9, font: fontBold })
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
    cover.drawText(trunc(e.invoiceNumber || '—', 9), { x: 95, y, size: 9, font })
    cover.drawText(trunc(e.vendor || '—', 36), { x: 150, y, size: 9, font })
    cover.drawText(CATEGORY_LABELS[e.category], { x: 350, y, size: 9, font })
    cover.drawText(formatBRL(e.amount), { x: 500, y, size: 9, font })
    y -= 16
  }
  y -= 6
  cover.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5 })
  y -= 18
  cover.drawText(`Total: ${formatBRL(total)}`, { x: 400, y, size: 12, font: fontBold })

  for (const e of expenses) {
    if (!e.photo) continue
    const bytes = new Uint8Array(await e.photo.arrayBuffer())
    let img
    try {
      img = e.photo.type.includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    } catch {
      continue
    }
    const page = pdf.addPage([595, 842])
    page.drawText(
      `${formatDateBR(e.date)} · ${e.vendor || CATEGORY_LABELS[e.category]} · ${formatBRL(e.amount)} · ${PAYMENT_LABELS[e.paymentType]}`,
      { x: 40, y: 800, size: 10, font: fontBold },
    )
    const scale = Math.min(515 / img.width, 720 / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    page.drawImage(img, { x: (595 - w) / 2, y: 770 - h, width: w, height: h })
  }

  const slug = (titulo ?? 'despesas').toLowerCase().replace(/[^a-z]+/g, '-')
  const name = `comprovantes-${slug}-${monthLabel.toLowerCase().replace(/\s+/g, '-')}.pdf`
  await deliver(new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }), name)
}

/* ---------- planilha: preenche o MODELO REAL do financeiro ---------- */

/**
 * Preenche o arquivo-modelo da empresa (logo, estilos e fórmulas intactos)
 * e entrega. Retorna quantas despesas não couberam nas linhas do modelo.
 */
export async function exportRelatorioXLSX(
  expenses: Expense[],
  profile: Profile,
  periodo: string,
  tipo: string,
  adiantamento = 0,
): Promise<number> {
  const { blob, overflow } = await fillReportXlsx(SCHEFFER_TEMPLATE, {
    profile,
    periodo,
    expenses,
    adiantamento,
  })
  const slug = tipo.toLowerCase().replace(/[^a-z]+/g, '-')
  const name = `relatorio-${slug}-${periodo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`
  await deliver(blob, name)
  return overflow
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
