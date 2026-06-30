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
  source: ExpenseSource
  reimbursement: ReimbursementStatus
  /** Foto do comprovante guardada localmente (Blob no IndexedDB) */
  photo?: Blob
  /** Caminho no Supabase Storage depois de sincronizar */
  photoPath?: string
  /** Dados do recibo manual gerado (quando source = 'recibo') */
  receipt?: GeneratedReceipt
  sync: SyncStatus
  createdAt: string
  updatedAt: string
  /** Soft delete para propagar exclusão na sincronização */
  deleted?: boolean
}

export interface GeneratedReceipt {
  template: ReceiptTemplate
  payerName: string
  payerDoc: string
  issuerName: string
  issuerDoc: string
  city: string
  refersTo: string
}

export type ReceiptTemplate = 'classico' | 'moderno' | 'minimalista'

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
