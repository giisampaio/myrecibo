// Motor de "modelos de relatório": preenche um arquivo .xlsx REAL (o modelo
// do financeiro, com logo/estilos/fórmulas) escrevendo só os valores das
// células mapeadas — nunca reconstrói o layout, então a fidelidade é total.
//
// Um modelo = arquivo .xlsx + um mapping de endereços (JSON). Hoje o registro
// é embutido (Scheffer); na fase Supabase os modelos viram linhas numa tabela
// + arquivo no Storage, liberados por usuário — este motor não muda.

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import type { Category, Expense } from '../types'
import type { Profile } from './profile'

export interface TemplateMapping {
  /** caminho da worksheet dentro do zip */
  sheetPath: string
  /** campo do perfil/período → endereço da célula (ex.: empresa → B4) */
  header: {
    empresa?: string
    filial?: string
    periodo?: string
    colaborador?: string
    centroCusto?: string
    objetivo?: string
  }
  table: {
    firstRow: number
    lastRow: number
    dateCol: string
    invoiceCol?: string
    descriptionCol: string
    /** categoria do app → coluna do modelo; 'fallback' recebe o resto */
    categoryCols: Partial<Record<Category, string>> & { fallback: string }
    totalCol: string
  }
  cells: {
    adiantamento?: string
  }
  /**
   * Células de fórmula cujo VALOR EM CACHE precisa ser atualizado: leitores
   * rápidos (Quick Look do iPhone, pré-visualizações) não recalculam fórmulas
   * — mostram o cache. O Excel de verdade recalcula ao abrir e chega ao mesmo
   * número; escrever o cache correto atende os dois.
   */
  cached?: {
    /** linha com SUM por coluna (só atualiza células que tenham fórmula) */
    sumRow?: number
    /** células cujo cache = total geral */
    total?: string[]
    /** células cujo cache = adiantamento − total */
    saldo?: string[]
  }
  /** Correções pontuais de fórmulas quebradas no arquivo da empresa
   *  (substituição literal no XML da worksheet). */
  formulaFixes?: { find: string; replace: string }[]
}

export interface ReportTemplateDef {
  id: string
  name: string
  /** URL do .xlsx-modelo (hoje em /templates/, depois Supabase Storage) */
  file: string
  mapping: TemplateMapping
}

export interface ReportPayload {
  profile: Profile
  periodo: string
  expenses: Expense[]
  adiantamento: number
}

export interface ReportResult {
  blob: Blob
  /** despesas que não couberam nas linhas do modelo (0 = todas entraram) */
  overflow: number
}

/* ---------- registro embutido ---------- */

export const SCHEFFER_TEMPLATE: ReportTemplateDef = {
  id: 'scheffer',
  name: 'Relatório de Viagem — Scheffer',
  file: '/templates/scheffer.xlsx',
  mapping: {
    sheetPath: 'xl/worksheets/sheet1.xml',
    header: {
      empresa: 'B4',
      filial: 'F4',
      periodo: 'J4',
      colaborador: 'B6',
      centroCusto: 'F6',
      objetivo: 'C8',
    },
    table: {
      firstRow: 13,
      lastRow: 50,
      dateCol: 'A',
      invoiceCol: 'B',
      descriptionCol: 'C',
      categoryCols: {
        hospedagem: 'D',
        transporte: 'E',
        alimentacao: 'F',
        fallback: 'J', // DIVERSOS (comissaria, peça, impressão, outros)
      },
      totalCol: 'K',
    },
    cells: {
      adiantamento: 'K53',
    },
    cached: {
      sumRow: 51, // linha MÉDIA/somatórios (F51/J51/K51 têm fórmulas)
      total: ['K52'], // TOTAL DESPESAS (fórmula =K51)
      saldo: ['K54'], // SALDO (fórmula =K53-K52)
    },
    formulaFixes: [
      // soma de DIVERSOS veio com intervalo errado no arquivo original
      { find: 'SUM(J25:J48)', replace: 'SUM(J12:J50)' },
    ],
  },
}

export const REPORT_TEMPLATES: ReportTemplateDef[] = [SCHEFFER_TEMPLATE]

/* ---------- preenchimento ---------- */

export async function fillReportXlsx(
  def: ReportTemplateDef,
  payload: ReportPayload,
): Promise<ReportResult> {
  const res = await fetch(def.file)
  if (!res.ok) throw new Error(`modelo indisponível (${res.status})`)
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()))
  const m = def.mapping
  let xml = strFromU8(zip[m.sheetPath])

  // correções declaradas de fórmulas do arquivo original
  for (const fix of m.formulaFixes ?? []) xml = xml.replace(fix.find, fix.replace)

  // cabeçalho
  const p = payload.profile
  const header: [string | undefined, string][] = [
    [m.header.empresa, p.empresa],
    [m.header.filial, p.filial],
    [m.header.periodo, payload.periodo],
    [m.header.colaborador, p.colaborador],
    [m.header.centroCusto, p.centroCusto],
    [m.header.objetivo, p.objetivo],
  ]
  for (const [ref, value] of header) {
    if (ref) xml = setText(xml, ref, value)
  }

  // tabela de despesas (ordenada por data)
  const slots = m.table.lastRow - m.table.firstRow + 1
  const list = [...payload.expenses].sort((a, b) => a.date.localeCompare(b.date))
  const fits = list.slice(0, slots)
  const colSums = new Map<string, number>()
  for (let i = 0; i < fits.length; i++) {
    const e = fits[i]
    const row = m.table.firstRow + i
    xml = setNumber(xml, `${m.table.dateCol}${row}`, dateSerial(e.date))
    if (m.table.invoiceCol && e.invoiceNumber)
      xml = setText(xml, `${m.table.invoiceCol}${row}`, e.invoiceNumber)
    xml = setText(
      xml,
      `${m.table.descriptionCol}${row}`,
      e.vendor || e.description || '',
    )
    const col = m.table.categoryCols[e.category] ?? m.table.categoryCols.fallback
    xml = setNumber(xml, `${col}${row}`, round2(e.amount))
    xml = setNumber(xml, `${m.table.totalCol}${row}`, round2(e.amount))
    colSums.set(col, (colSums.get(col) ?? 0) + e.amount)
    colSums.set(m.table.totalCol, (colSums.get(m.table.totalCol) ?? 0) + e.amount)
  }
  const total = round2(colSums.get(m.table.totalCol) ?? 0)

  if (m.cells.adiantamento && payload.adiantamento > 0)
    xml = setNumber(xml, m.cells.adiantamento, round2(payload.adiantamento))

  // Atualiza o CACHE das fórmulas (Quick Look/preview não recalcula)
  if (m.cached?.sumRow) {
    const cols = new Set([...Object.values(m.table.categoryCols), m.table.totalCol])
    for (const col of cols)
      xml = setCachedFormula(xml, `${col}${m.cached.sumRow}`, round2(colSums.get(col) ?? 0))
  }
  for (const ref of m.cached?.total ?? []) xml = setCachedFormula(xml, ref, total)
  for (const ref of m.cached?.saldo ?? [])
    xml = setCachedFormula(xml, ref, round2(payload.adiantamento - total))

  const out: Record<string, Uint8Array> = { ...zip }
  out[m.sheetPath] = strToU8(xml)
  const bytes = zipSync(out, { level: 6 })
  return {
    blob: new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    overflow: list.length - fits.length,
  }
}

/* ---------- escrita de células (preserva o atributo de estilo s=) ---------- */

function setNumber(xml: string, ref: string, value: number): string {
  return setCell(xml, ref, `<v>${value}</v>`)
}

function setText(xml: string, ref: string, value: string): string {
  if (!value) return setCell(xml, ref, null)
  return setCell(xml, ref, `<is><t xml:space="preserve">${escapeXml(value)}</t></is>`, 'inlineStr')
}

/** Atualiza só o <v> em cache de uma célula de FÓRMULA (mantém o <f>).
 *  Célula sem fórmula fica como está. */
function setCachedFormula(xml: string, ref: string, value: number): string {
  const re = new RegExp(`<c r="${ref}"([^>]*)>([\\s\\S]*?)</c>`)
  const m = re.exec(xml)
  if (!m) return xml
  const fm = /<f[^>]*>[\s\S]*?<\/f>|<f[^>]*\/>/.exec(m[2])
  if (!fm) return xml
  return xml.replace(m[0], `<c r="${ref}"${m[1]}>${fm[0]}<v>${value}</v></c>`)
}

/** Substitui o conteúdo de uma célula existente ou insere na linha (em ordem). */
function setCell(xml: string, ref: string, content: string | null, tAttr?: string): string {
  const cellRe = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`)
  const m = cellRe.exec(xml)
  if (m) {
    const attrs = m[1].replace(/\s+t="[^"]*"/, '')
    const open = `<c r="${ref}"${attrs}${tAttr ? ` t="${tAttr}"` : ''}`
    return xml.replace(m[0], content == null ? `${open}/>` : `${open}>${content}</c>`)
  }
  if (content == null) return xml

  // célula não existe: insere na posição correta dentro da <row>
  const rowNum = ref.replace(/^[A-Z]+/, '')
  const colNum = colIndex(ref.replace(/\d+$/, ''))
  const rowRe = new RegExp(`<row r="${rowNum}"[^>]*>`)
  const rm = rowRe.exec(xml)
  if (!rm) return xml // linha ausente no modelo: ignora silenciosamente
  const rowStart = rm.index + rm[0].length
  const rowEnd = xml.indexOf('</row>', rowStart)
  const cell = `<c r="${ref}"${tAttr ? ` t="${tAttr}"` : ''}>${content}</c>`

  const section = xml.slice(rowStart, rowEnd)
  const iter = section.matchAll(/<c r="([A-Z]+)\d+"/g)
  for (const cm of iter) {
    if (colIndex(cm[1]) > colNum) {
      const at = rowStart + (cm.index ?? 0)
      return xml.slice(0, at) + cell + xml.slice(at)
    }
  }
  return xml.slice(0, rowEnd) + cell + xml.slice(rowEnd)
}

function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

/** Serial de data do Excel (sistema 1900): dias desde 30/12/1899. */
function dateSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
