import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx-js-style'
import { CATEGORY_LABELS, PAYMENT_LABELS, type Category, type Expense } from '../types'
import type { Profile } from './profile'
import { formatBRL, formatDateBR } from './format'

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

/* ---------- planilha no modelo "Relatório de Viagem" (Scheffer) ---------- */

const HEADERS = [
  'DATA', 'Nº NF', 'Descrição', 'HOTEL', 'TAXI', 'REFEIÇÕES',
  'PEDÁGIO', 'PASSAGEM', 'COMBUSTÍVEL', 'DIVERSOS', 'TOTAL',
]
const NCOLS = HEADERS.length // 11

// Categoria do app -> coluna do modelo
const CAT_COL: Record<Category, number> = {
  hospedagem: 3, // HOTEL
  transporte: 4, // TAXI
  alimentacao: 5, // REFEIÇÕES
  comissaria: 9, // DIVERSOS
  peca: 9,
  impressao: 9,
  outros: 9,
}

export async function exportRelatorioXLSX(
  expenses: Expense[],
  profile: Profile,
  periodo: string,
  tipo: string,
  adiantamento = 0,
) {
  const blank = () => Array<string | number>(NCOLS).fill('')
  const aoa: (string | number)[][] = []

  aoa.push(['RELATÓRIO DE VIAGEM'])
  aoa.push(['Relatório', tipo])
  aoa.push(['EMPRESA', profile.empresa, '', 'FILIAL', profile.filial, '', 'PERÍODO', periodo])
  aoa.push(['COLABORADOR', profile.colaborador, '', 'CENTRO DE CUSTO', profile.centroCusto])
  aoa.push(['OBJETIVO DA VIAGEM', profile.objetivo])
  aoa.push([])
  aoa.push(['Descrição das Despesas da Viagem'])
  const headerRow = aoa.length
  aoa.push([...HEADERS])

  const sums = Array<number>(NCOLS).fill(0)
  let total = 0
  const dataStart = aoa.length
  for (const e of expenses) {
    const row = blank()
    row[0] = formatDateBR(e.date)
    row[1] = e.invoiceNumber || ''
    row[2] = e.vendor || e.description || CATEGORY_LABELS[e.category]
    const col = CAT_COL[e.category]
    row[col] = e.amount
    row[10] = e.amount
    sums[col] += e.amount
    sums[10] += e.amount
    total += e.amount
    aoa.push(row)
  }
  const dataEnd = aoa.length - 1

  const totalRow = blank()
  totalRow[2] = 'TOTAL'
  for (let c = 3; c <= 10; c++) totalRow[c] = sums[c] || ''
  aoa.push(totalRow)
  const totalRowIdx = aoa.length - 1

  aoa.push([])
  const sumRowIdx = aoa.length
  const round2 = (n: number) => Math.round(n * 100) / 100
  aoa.push(['', '', '', '', '', '', '', 'TOTAL DESPESAS', '', '', round2(total)])
  aoa.push(['', '', '', '', '', '', '', '(-) ADIANTAMENTO', '', '', round2(adiantamento)])
  aoa.push(['', '', '', '', '', '', '', 'SALDO', '', '', round2(adiantamento - total)])
  aoa.push([])
  aoa.push(['01- Anexar os comprovantes que justifiquem as despesas (recibos, notas fiscais, bilhetes), em ordem cronológica'])
  aoa.push(['02- Solicite aprovação de seu superior imediato'])
  aoa.push(['03- Informe o Centro de Custo que será debitado'])
  aoa.push([])
  aoa.push([])
  aoa.push(['', 'Assinatura do Colaborador', '', '', 'Assinatura Superior Imediato'])
  aoa.push(['', 'Assinatura do Setor de Viagens'])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 11 }, { wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 11 },
    { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 12 }, { wch: 13 },
  ]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }]

  const moneyFmt = 'R$ #,##0.00'
  const b = { style: 'thin', color: { rgb: 'FFBFBFBF' } }
  const borders = { top: b, bottom: b, left: b, right: b }
  const cellAt = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]
  const style = (r: number, c: number, s: object) => {
    const cell = cellAt(r, c)
    if (cell) cell.s = { ...(cell.s || {}), ...s }
  }
  const fmt = (r: number, c: number) => {
    const cell = cellAt(r, c)
    if (cell) cell.z = moneyFmt
  }

  style(0, 0, { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } })
  ;[[2, 0], [2, 3], [2, 6], [3, 0], [3, 3], [4, 0], [6, 0]].forEach(([r, c]) =>
    style(r, c, { font: { bold: true } }),
  )
  for (let c = 0; c < NCOLS; c++)
    style(headerRow, c, {
      font: { bold: true },
      alignment: { horizontal: 'center' },
      fill: { fgColor: { rgb: 'FFEFEFEF' } },
      border: borders,
    })
  for (let r = dataStart; r <= dataEnd; r++) {
    for (let c = 0; c < NCOLS; c++) style(r, c, { border: borders })
    for (let c = 3; c <= 10; c++) fmt(r, c)
  }
  for (let c = 0; c < NCOLS; c++) style(totalRowIdx, c, { font: { bold: true }, border: borders })
  for (let c = 3; c <= 10; c++) fmt(totalRowIdx, c)
  for (let i = 0; i < 3; i++) {
    style(sumRowIdx + i, 7, { font: { bold: true } })
    fmt(sumRowIdx + i, 10)
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
  const slug = tipo.toLowerCase().replace(/[^a-z]+/g, '-')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const name = `relatorio-${slug}-${periodo.toLowerCase().replace(/\s+/g, '-')}.xlsx`
  await deliver(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    name,
  )
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
