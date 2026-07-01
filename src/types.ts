// Tipos centrais do MyRecibo

export type PaymentType = 'corporativo' | 'pessoal'

export type Category =
  | 'alimentacao'
  | 'hospedagem'
  | 'comissaria'
  | 'peca'
  | 'impressao'
  | 'transporte'
  | 'outros'

/** Origem do registro */
export type ExpenseSource = 'ocr' | 'manual' | 'recibo'

/** Situação do reembolso (só relevante quando paymentType = 'pessoal') */
export type ReimbursementStatus = 'na' | 'pendente' | 'solicitado' | 'pago'

/** Estado de sincronização com o Supabase */
export type SyncStatus = 'local' | 'sincronizado'

export interface Expense {
  /** UUID gerado no cliente (funciona offline) */
  id: string
  /** Dono do registro (auth.uid do Supabase); vazio enquanto offline sem login */
  userId: string | null
  /** Data da despesa (ISO yyyy-mm-dd) */
  date: string
  amount: number
  paymentType: PaymentType
  category: Category
  vendor: string
  description: string
  /** Nº da nota fiscal/cupom (opcional; vai para a coluna Nº NF do relatório) */
  invoiceNumber?: string
  source: ExpenseSource
  reimbursement: ReimbursementStatus
  /** Foto do comprovante guardada localmente (Blob no IndexedDB) */
  photo?: Blob
  /** Caminho no Supabase Storage depois de sincronizar */
  photoPath?: string
  sync: SyncStatus
  createdAt: string
  updatedAt: string
  /** Soft delete para propagar exclusão na sincronização */
  deleted?: boolean
}

export type ReceiptTemplate =
  | 'classico'
  | 'moderno'
  | 'minimalista'
  | 'elegante'
  | 'termico-amarelo'
  | 'termico-branco'
  | 'nota'
  | 'comanda'
  | 'itens-moderno'
  | 'itens-colorido'
  | 'servico'
  | 'taxi'
  | 'canhoto'
  | 'manuscrito'
  | 'pautado'

/** Item lançado manualmente no recibo (não é persistido) */
export interface ReceiptItem {
  description: string
  qty: number
  unitPrice: number
}

export const CATEGORY_LABELS: Record<Category, string> = {
  alimentacao: 'Alimentação',
  hospedagem: 'Hospedagem',
  comissaria: 'Comissaria',
  peca: 'Peça',
  impressao: 'Impressão',
  transporte: 'Transporte',
  outros: 'Outros',
}

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  corporativo: 'Corporativo',
  pessoal: 'Pessoal',
}

export const REIMBURSEMENT_LABELS: Record<ReimbursementStatus, string> = {
  na: '—',
  pendente: 'A reembolsar',
  solicitado: 'Solicitado',
  pago: 'Reembolsado',
}
