import Dexie, { type EntityTable } from 'dexie'
import type { Expense } from '../types'

/**
 * Banco local (IndexedDB) — fonte da verdade no dispositivo.
 * Tudo funciona offline; a sincronização com o Supabase é opcional.
 */
const db = new Dexie('myrecibo') as Dexie & {
  expenses: EntityTable<Expense, 'id'>
}

db.version(1).stores({
  // Índices para filtrar por mês, forma de pagamento e estado de sync
  expenses: 'id, date, paymentType, category, sync, reimbursement, deleted',
})

export { db }
