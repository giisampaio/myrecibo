import { db } from './db'
import type {
  Category,
  Expense,
  PaymentType,
  ExpenseSource,
  ReimbursementStatus,
} from '../types'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // fallback simples
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export interface NewExpenseInput {
  date: string
  amount: number
  paymentType: PaymentType
  category: Category
  vendor: string
  description: string
  source: ExpenseSource
  photo?: Blob
}

export async function addExpense(input: NewExpenseInput): Promise<string> {
  const now = new Date().toISOString()
  const expense: Expense = {
    id: uuid(),
    userId: null,
    date: input.date,
    amount: input.amount,
    paymentType: input.paymentType,
    category: input.category,
    vendor: input.vendor,
    description: input.description,
    source: input.source,
    reimbursement: input.paymentType === 'pessoal' ? 'pendente' : 'na',
    photo: input.photo,
    sync: 'local',
    createdAt: now,
    updatedAt: now,
  }
  await db.expenses.add(expense)
  return expense.id
}

export async function updateExpense(
  id: string,
  patch: Partial<Expense>,
): Promise<void> {
  await db.expenses.update(id, { ...patch, updatedAt: new Date().toISOString() })
}

export async function softDeleteExpense(id: string): Promise<void> {
  await db.expenses.update(id, {
    deleted: true,
    sync: 'local',
    updatedAt: new Date().toISOString(),
  })
}

export async function setReimbursement(
  ids: string[],
  status: ReimbursementStatus,
): Promise<void> {
  const now = new Date().toISOString()
  await db.expenses.bulkUpdate(
    ids.map((id) => ({ key: id, changes: { reimbursement: status, sync: 'local', updatedAt: now } })),
  )
}

export function monthRange(year: number, month0: number): [string, string] {
  const start = new Date(Date.UTC(year, month0, 1))
  const end = new Date(Date.UTC(year, month0 + 1, 1))
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}
