import type { CSSProperties, ReactElement } from 'react'
import type { ReceiptItem, ReceiptTemplate } from '../types'
import { valorPorExtenso } from './receipt'

export interface ReceiptRenderData {
  issuerName: string
  issuerDoc: string
  payerName: string
  payerDoc: string
  city: string
  date: string // yyyy-mm-dd
  refersTo: string
  items: ReceiptItem[]
  total: number
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)} de ${MONTHS[Number(m) - 1] ?? ''} de ${y}`
}
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const PAPER: CSSProperties = {
  width: 380,
  boxSizing: 'border-box',
  color: '#1f2937',
  background: '#ffffff',
  WebkitFontSmoothing: 'antialiased',
}

/* ---------- blocos reutilizáveis ---------- */

function ItemsTable({ items, accent = '#111827' }: { items: ReceiptItem[]; accent?: string }) {
  if (items.length === 0) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, margin: '4px 0' }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${accent}`, color: accent }}>
          <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 700 }}>Descrição</th>
          <th style={{ textAlign: 'center', fontWeight: 700 }}>Qtd</th>
          <th style={{ textAlign: 'right', fontWeight: 700 }}>Unit.</th>
          <th style={{ textAlign: 'right', fontWeight: 700 }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eef0f2' }}>
            <td style={{ padding: '4px 0' }}>{it.description || '—'}</td>
            <td style={{ textAlign: 'center' }}>{it.qty}</td>
            <td style={{ textAlign: 'right' }}>{brl(it.unitPrice)}</td>
            <td style={{ textAlign: 'right' }}>{brl(it.qty * it.unitPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Signature({ d, color = '#1f2937' }: { d: ReceiptRenderData; color?: string }) {
  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ borderTop: `1px solid ${color}`, width: 220, paddingTop: 4, fontSize: 11 }}>
        {d.issuerName || 'Emitente'}
        {d.issuerDoc && <div style={{ color: '#6b7280' }}>{d.issuerDoc}</div>}
      </div>
    </div>
  )
}

function reciboProse(d: ReceiptRenderData) {
  return (
    <>
      Recebi de <b>{d.payerName || '—'}</b>
      {d.payerDoc ? ` (${d.payerDoc})` : ''} a importância de <b>{brl(d.total)}</b> (
      {valorPorExtenso(d.total)}){d.refersTo ? `, referente a ${d.refersTo}` : ''}.
    </>
  )
}

/* ---------- 1. Clássico ---------- */
function Classico({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div style={{ ...PAPER, fontFamily: 'Georgia, serif', padding: 28, border: '1px solid #e5e7eb' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderBottom: '2px solid #1f2937',
          paddingBottom: 8,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>RECIBO</span>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{brl(d.total)}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 14px' }}>{reciboProse(d)}</p>
      <ItemsTable items={d.items} />
      <p style={{ fontSize: 13, margin: '14px 0 0' }}>
        {d.city || '—'}, {longDate(d.date)}.
      </p>
      <Signature d={d} />
    </div>
  )
}

/* ---------- 2. Moderno ---------- */
function Moderno({ data: d }: { data: ReceiptRenderData }) {
  const accent = '#0ea5a0'
  return (
    <div style={{ ...PAPER, fontFamily: 'Helvetica, Arial, sans-serif', border: '1px solid #e5e7eb' }}>
      <div style={{ height: 6, background: accent }} />
      <div style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: accent }}>Recibo</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{brl(d.total)}</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 12px' }}>{reciboProse(d)}</p>
        <ItemsTable items={d.items} accent={accent} />
        <p style={{ fontSize: 12, color: '#6b7280', margin: '14px 0 0' }}>
          {d.city || '—'}, {longDate(d.date)}.
        </p>
        <Signature d={d} color={accent} />
      </div>
    </div>
  )
}

/* ---------- 3. Minimalista ---------- */
function Minimalista({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div style={{ ...PAPER, fontFamily: 'Helvetica, Arial, sans-serif', padding: 32 }}>
      <div style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: '#9ca3af' }}>Recibo</div>
      <div style={{ fontSize: 30, fontWeight: 600, margin: '2px 0 4px' }}>{brl(d.total)}</div>
      <div style={{ height: 1, background: '#111827', width: 48, margin: '10px 0 18px' }} />
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 12px' }}>{reciboProse(d)}</p>
      <ItemsTable items={d.items} />
      <p style={{ fontSize: 12, color: '#6b7280', margin: '14px 0 0' }}>
        {d.city || '—'}, {longDate(d.date)}.
      </p>
      <Signature d={d} />
    </div>
  )
}

/* ---------- 4. Elegante ---------- */
function Elegante({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div style={{ ...PAPER, fontFamily: 'Georgia, serif', padding: 10, background: '#faf9f6' }}>
      <div style={{ border: '2px solid #b08d57', padding: 24 }}>
        <div style={{ textAlign: 'center', borderBottom: '1px solid #b08d57', paddingBottom: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 22, letterSpacing: 4, color: '#7c5e2e' }}>RECIBO</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{brl(d.total)}</div>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.8, margin: '0 0 12px' }}>{reciboProse(d)}</p>
        <ItemsTable items={d.items} accent="#7c5e2e" />
        <p style={{ fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>
          {d.city || '—'}, {longDate(d.date)}.
        </p>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #1f2937', width: 200, margin: '36px auto 0', paddingTop: 4, fontSize: 11 }}>
            {d.issuerName || 'Emitente'}
            {d.issuerDoc && <div style={{ color: '#6b7280' }}>{d.issuerDoc}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 5/6. Térmico (cupom não fiscal) ---------- */
function Thermal({ data: d, paper }: { data: ReceiptRenderData; paper: string }) {
  const dash = '------------------------------'
  return (
    <div
      style={{
        width: 300,
        boxSizing: 'border-box',
        background: paper,
        color: '#2b2b28',
        fontFamily: "'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.5,
        padding: '16px 18px',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 1 }}>
        {(d.issuerName || 'ESTABELECIMENTO').toUpperCase()}
      </div>
      {d.city && <div style={{ textAlign: 'center' }}>{d.city}</div>}
      {d.issuerDoc && <div style={{ textAlign: 'center' }}>{d.issuerDoc}</div>}
      <div style={{ textAlign: 'center', letterSpacing: 2, margin: '6px 0' }}>SEM VALOR FISCAL</div>
      <div>{dash}</div>
      {d.items.length > 0 ? (
        <>
          {d.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {it.qty}x {it.description || 'item'}
              </span>
              <span>{brl(it.qty * it.unitPrice)}</span>
            </div>
          ))}
        </>
      ) : (
        d.refersTo && <div>{d.refersTo}</div>
      )}
      <div>{dash}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
        <span>TOTAL</span>
        <span>{brl(d.total)}</span>
      </div>
      {d.payerName && <div style={{ marginTop: 6 }}>Cliente: {d.payerName}</div>}
      <div style={{ textAlign: 'center', marginTop: 8 }}>{shortDate(d.date)}</div>
      <div style={{ textAlign: 'center' }}>Obrigado, volte sempre!</div>
    </div>
  )
}

/* ---------- 7. Nota de venda ---------- */
function Nota({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div style={{ ...PAPER, fontFamily: 'Helvetica, Arial, sans-serif', border: '1px solid #e5e7eb', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{d.issuerName || 'Emitente'}</div>
          {d.issuerDoc && <div style={{ fontSize: 11, color: '#6b7280' }}>{d.issuerDoc}</div>}
          {d.city && <div style={{ fontSize: 11, color: '#6b7280' }}>{d.city}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>NOTA DE VENDA</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{shortDate(d.date)}</div>
        </div>
      </div>
      {d.payerName && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <b>Cliente:</b> {d.payerName}
          {d.payerDoc ? ` · ${d.payerDoc}` : ''}
        </div>
      )}
      <ItemsTable items={d.items} />
      {d.refersTo && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Ref.: {d.refersTo}</div>}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 16,
          marginTop: 12,
          paddingTop: 10,
          borderTop: '2px solid #111827',
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        <span>Total</span>
        <span>{brl(d.total)}</span>
      </div>
    </div>
  )
}

/* ---------- 8. Comanda (papel pautado) ---------- */
function Comanda({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div
      style={{
        ...PAPER,
        fontFamily: "'Comic Sans MS', 'Segoe Print', cursive",
        padding: 24,
        background:
          'repeating-linear-gradient(#ffffff, #ffffff 27px, #cfe3f5 28px)',
        border: '1px solid #cbd5e1',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Comanda / Pedido</div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{d.issuerName || 'Emitente'}</div>
      <div style={{ fontSize: 12, marginBottom: 12 }}>{shortDate(d.date)}</div>
      {d.items.length > 0
        ? d.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, height: 28 }}>
              <span>
                {it.qty} {it.description || 'item'}
              </span>
              <span>{brl(it.qty * it.unitPrice)}</span>
            </div>
          ))
        : d.refersTo && <div style={{ fontSize: 13, height: 28 }}>{d.refersTo}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 8 }}>
        <span>Total</span>
        <span>{brl(d.total)}</span>
      </div>
    </div>
  )
}

/* ---------- 9. Recibo com itens — moderno ---------- */
function ItensModerno({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div style={{ ...PAPER, fontFamily: 'Helvetica, Arial, sans-serif', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Recibo</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{brl(d.total)}</span>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        {d.payerName ? `Pago por ${d.payerName}` : ''}
        {d.refersTo ? ` · ${d.refersTo}` : ''}
      </div>
      <ItemsTable items={d.items} />
      <p style={{ fontSize: 12, color: '#6b7280', margin: '14px 0 0' }}>
        {d.city || '—'}, {longDate(d.date)}.
      </p>
      <Signature d={d} />
    </div>
  )
}

/* ---------- 10. Recibo com itens — colorido ---------- */
function ItensColorido({ data: d }: { data: ReceiptRenderData }) {
  const accent = '#4f46e5'
  return (
    <div style={{ ...PAPER, fontFamily: 'Helvetica, Arial, sans-serif', border: '1px solid #e5e7eb' }}>
      <div
        style={{
          background: accent,
          color: '#fff',
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>RECIBO</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{brl(d.total)}</span>
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
          {d.payerName ? `Recebido de ${d.payerName}` : ''}
          {d.refersTo ? ` · ${d.refersTo}` : ''}
        </div>
        <ItemsTable items={d.items} accent={accent} />
        <p style={{ fontSize: 12, color: '#6b7280', margin: '14px 0 0' }}>
          {d.city || '—'}, {longDate(d.date)}.
        </p>
        <Signature d={d} color={accent} />
      </div>
    </div>
  )
}

/* ---------- 11. Prestação de serviços ---------- */
function Servico({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div style={{ ...PAPER, fontFamily: 'Georgia, serif', padding: 28, border: '1px solid #d1d5db' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, borderTop: '3px double #1f2937', borderBottom: '3px double #1f2937', padding: '8px 0' }}>
          RECIBO DE PRESTAÇÃO DE SERVIÇOS
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{brl(d.total)}</div>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.8, margin: '0 0 10px', textAlign: 'justify' }}>
        Recebi de <b>{d.payerName || '—'}</b>
        {d.payerDoc ? ` (${d.payerDoc})` : ''} a importância de <b>{brl(d.total)}</b> (
        {valorPorExtenso(d.total)}), referente aos serviços de{' '}
        <b>{d.refersTo || '—'}</b>, pelos quais dou plena e total quitação.
      </p>
      <ItemsTable items={d.items} />
      <p style={{ fontSize: 13, margin: '16px 0 0' }}>
        {d.city || '—'}, {longDate(d.date)}.
      </p>
      <div style={{ textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid #1f2937', width: 230, margin: '40px auto 0', paddingTop: 4, fontSize: 11 }}>
          {d.issuerName || 'Prestador(a) de serviços'}
          {d.issuerDoc && <div style={{ color: '#6b7280' }}>{d.issuerDoc}</div>}
        </div>
      </div>
    </div>
  )
}

/* ---------- 12. Recibo de corrida (táxi) ---------- */
function Taxi({ data: d }: { data: ReceiptRenderData }) {
  const checker: CSSProperties = {
    height: 12,
    backgroundColor: '#f5c518',
    backgroundImage:
      'linear-gradient(45deg, #17181c 25%, transparent 25%, transparent 75%, #17181c 75%), ' +
      'linear-gradient(45deg, #17181c 25%, transparent 25%, transparent 75%, #17181c 75%)',
    backgroundSize: '12px 12px',
    backgroundPosition: '0 0, 6px 6px',
  }
  return (
    <div
      style={{
        width: 300,
        boxSizing: 'border-box',
        background: '#fffdf5',
        color: '#17181c',
        fontFamily: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
        border: '1px solid #d6d3c4',
      }}
    >
      <div style={checker} />
      <div style={{ padding: '14px 18px' }}>
        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>
          RECIBO DE TÁXI
        </div>
        <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, margin: '8px 0 12px' }}>
          {brl(d.total)}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.9 }}>
          <div>
            <b>Passageiro:</b> {d.payerName || '—'}
          </div>
          <div>
            <b>Percurso:</b> {d.refersTo || '—'}
          </div>
          <div>
            <b>Data:</b> {shortDate(d.date)}
            {d.city ? ` · ${d.city}` : ''}
          </div>
        </div>
        <div style={{ borderTop: '1px dashed #9ca3af', margin: '12px 0 0' }} />
        <div style={{ borderTop: '1px solid #17181c', width: 190, margin: '34px auto 0', paddingTop: 4, fontSize: 11, textAlign: 'center' }}>
          {d.issuerName || 'Motorista'}
          {d.issuerDoc && <div style={{ color: '#6b7280' }}>{d.issuerDoc}</div>}
        </div>
      </div>
      <div style={checker} />
    </div>
  )
}

/* ---------- 13. Bloco comercial (canhoto) ---------- */
function Canhoto({ data: d }: { data: ReceiptRenderData }) {
  // número determinístico do bloco a partir da data e do valor
  const numero = `${d.date.slice(8, 10)}${d.date.slice(5, 7)}${String((Math.round(d.total * 100) % 90) + 10)}`
  const linha: CSSProperties = { borderBottom: '1px solid #9a9484', minHeight: 20, fontSize: 13 }
  return (
    <div
      style={{
        ...PAPER,
        background: '#f7f3e8',
        color: '#3b382f',
        fontFamily: 'Arial, Helvetica, sans-serif',
        borderTop: '2px dotted #b7b1a0',
        border: '1px solid #d8d2c0',
        padding: '18px 22px 24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>RECIBO</div>
          <div style={{ fontSize: 11, color: '#8a8471' }}>Nº {numero}</div>
        </div>
        <div style={{ border: '1.5px solid #3b382f', padding: '6px 12px', fontSize: 16, fontWeight: 700 }}>
          {brl(d.total)}
        </div>
      </div>
      <div style={{ display: 'grid', rowGap: 12 }}>
        <div>
          <span style={{ fontSize: 10, color: '#8a8471' }}>RECEBI(EMOS) DE</span>
          <div style={linha}>
            {d.payerName || ''}
            {d.payerDoc ? ` — ${d.payerDoc}` : ''}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 10, color: '#8a8471' }}>A QUANTIA DE</span>
          <div style={linha}>{valorPorExtenso(d.total)}</div>
        </div>
        <div>
          <span style={{ fontSize: 10, color: '#8a8471' }}>REFERENTE A</span>
          <div style={linha}>{d.refersTo || ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 26 }}>
        <div style={{ fontSize: 12 }}>
          {d.city || '—'}, {shortDate(d.date)}
        </div>
        <div style={{ borderTop: '1px solid #3b382f', width: 150, paddingTop: 4, fontSize: 10, textAlign: 'center' }}>
          {d.issuerName || 'Assinatura'}
          {d.issuerDoc && <div style={{ color: '#8a8471' }}>{d.issuerDoc}</div>}
        </div>
      </div>
    </div>
  )
}

/* ---------- 14. Manuscrito (preenchido à caneta) ---------- */
const INK = '#1e3a8a'
const HAND: CSSProperties = {
  fontFamily: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive",
  color: INK,
}
function Manuscrito({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div
      style={{
        ...PAPER,
        padding: '26px 24px',
        background: 'repeating-linear-gradient(#fffef9, #fffef9 29px, #d8e4f0 30px)',
        border: '1px solid #cbd5e1',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#374151',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, marginBottom: 16 }}>
        RECIBO{' '}
        <span style={{ ...HAND, fontSize: 17, transform: 'rotate(-1deg)', display: 'inline-block' }}>
          {brl(d.total)}
        </span>
      </div>
      <div style={{ fontSize: 12, lineHeight: '30px' }}>
        Recebi de{' '}
        <span style={{ ...HAND, fontSize: 15, transform: 'rotate(0.6deg)', display: 'inline-block' }}>
          {d.payerName || '—'}
        </span>{' '}
        a quantia de{' '}
        <span style={{ ...HAND, fontSize: 14, transform: 'rotate(-0.5deg)', display: 'inline-block' }}>
          {valorPorExtenso(d.total)}
        </span>
        {d.refersTo && (
          <>
            {' '}
            referente a{' '}
            <span style={{ ...HAND, fontSize: 14, transform: 'rotate(0.4deg)', display: 'inline-block' }}>
              {d.refersTo}
            </span>
          </>
        )}
        .
      </div>
      <div style={{ fontSize: 12, lineHeight: '30px', marginTop: 8 }}>
        <span style={{ ...HAND, fontSize: 14 }}>
          {d.city || '—'}, {shortDate(d.date)}
        </span>
      </div>
      <div style={{ marginTop: 34 }}>
        <div style={{ ...HAND, fontSize: 18, transform: 'rotate(-2deg)', display: 'inline-block' }}>
          {d.issuerName || 'Assinatura'}
        </div>
        <div style={{ borderTop: '1px solid #374151', width: 220, paddingTop: 3, fontSize: 10 }}>
          {d.issuerDoc || 'assinatura'}
        </div>
      </div>
    </div>
  )
}

/* ---------- 15. Recibo simples (pautado) ---------- */
function Pautado({ data: d }: { data: ReceiptRenderData }) {
  return (
    <div
      style={{
        ...PAPER,
        padding: '26px 26px 30px',
        background: 'repeating-linear-gradient(#ffffff, #ffffff 25px, #e5e7eb 26px)',
        fontFamily: 'Helvetica, Arial, sans-serif',
        color: '#111827',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 700, borderBottom: '3px solid #111827', paddingBottom: 2 }}>
          Recibo
        </span>
        <span
          style={{
            border: `2px solid ${INK}`,
            borderRadius: 6,
            color: INK,
            fontWeight: 700,
            fontSize: 15,
            padding: '4px 10px',
            transform: 'rotate(-1.5deg)',
          }}
        >
          {brl(d.total)}
        </span>
      </div>
      <p style={{ fontSize: 13, lineHeight: '26px', margin: 0 }}>{reciboProse(d)}</p>
      <p style={{ fontSize: 12, lineHeight: '26px', margin: '8px 0 0', color: '#6b7280' }}>
        {d.city || '—'}, {shortDate(d.date)}.
      </p>
      <Signature d={d} />
    </div>
  )
}

/* ---------- registry ---------- */

export interface TemplateDef {
  key: ReceiptTemplate
  label: string
  Component: (props: { data: ReceiptRenderData }) => ReactElement
}

export const RECEIPT_TEMPLATES: TemplateDef[] = [
  { key: 'classico', label: 'Clássico', Component: Classico },
  { key: 'moderno', label: 'Moderno', Component: Moderno },
  { key: 'minimalista', label: 'Minimalista', Component: Minimalista },
  { key: 'elegante', label: 'Elegante', Component: Elegante },
  { key: 'termico-amarelo', label: 'Térmico amarelo', Component: (p) => <Thermal {...p} paper="#fbf3d0" /> },
  { key: 'termico-branco', label: 'Térmico branco', Component: (p) => <Thermal {...p} paper="#ffffff" /> },
  { key: 'nota', label: 'Nota de venda', Component: Nota },
  { key: 'comanda', label: 'Comanda', Component: Comanda },
  { key: 'itens-moderno', label: 'Itens moderno', Component: ItensModerno },
  { key: 'itens-colorido', label: 'Itens colorido', Component: ItensColorido },
  { key: 'servico', label: 'Serviços', Component: Servico },
  { key: 'taxi', label: 'Táxi', Component: Taxi },
  { key: 'canhoto', label: 'Bloco comercial', Component: Canhoto },
  { key: 'manuscrito', label: 'Manuscrito', Component: Manuscrito },
  { key: 'pautado', label: 'Pautado', Component: Pautado },
]
