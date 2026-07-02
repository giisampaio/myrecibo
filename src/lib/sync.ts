// Sincronização offline-first com o Supabase (schema myrecibo).
//
// Princípios (nesta ordem): 1) nunca perder dados; 2) velocidade.
// - O aparelho é a fonte primária; a nuvem é backup + multi-aparelho.
// - Outbox natural: tudo que muda localmente fica `sync: 'local'` e é
//   empurrado no próximo ciclo. Só marca 'sincronizado' se o registro não
//   mudou durante o push (compare-and-set no updatedAt).
// - Pull nunca sobrescreve edição local pendente; conflito entre aparelhos
//   resolve por last-write-wins no updated_at.
// - Exclusão é sempre soft-delete (nada é apagado fisicamente em lugar algum).

import { db } from '../db/db'
import { supabase, isSupabaseEnabled, mdb } from './supabase'
import { getProfile, saveProfile, type Profile } from './profile'
import type { Expense } from '../types'

const BUCKET = 'myrecibo'
const PROFILE_TS_KEY = 'myrecibo.profile.updatedAt'

let currentUid: string | null = null
let syncing = false
let timer: ReturnType<typeof setTimeout> | undefined
let backoff = 0

/** Liga a sincronização para o usuário logado. Retorna o cleanup. */
export function startSync(uid: string): () => void {
  currentUid = uid
  const onOnline = () => scheduleSync(500)
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleSync(1200)
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  scheduleSync(800)
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(timer)
    currentUid = null
  }
}

/** Usuário logado (dono das novas despesas); null antes do login. */
export function currentUserId(): string | null {
  return currentUid
}

/** Agenda um ciclo de sync (com debounce). Chamado após cada gravação local. */
export function scheduleSync(delayMs = 3000): void {
  if (!isSupabaseEnabled || !currentUid) return
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delayMs)
}

/** Um ciclo completo: push (prioridade) e depois pull. */
export async function syncNow(): Promise<void> {
  const uid = currentUid
  if (!uid || syncing || !isSupabaseEnabled || !navigator.onLine) return
  syncing = true
  try {
    await pushProfile(uid)
    await pushExpenses(uid)
    await pullProfile(uid)
    await pullExpenses(uid)
    backoff = 0
  } catch {
    // erro de rede/servidor: tenta de novo com recuo exponencial
    backoff = Math.min(backoff + 1, 5)
    scheduleSync(2000 * 2 ** backoff)
  } finally {
    syncing = false
  }
}

/* ---------------- despesas: push ---------------- */

async function pushExpenses(uid: string): Promise<void> {
  const pending = (await db.expenses.where('sync').equals('local').toArray()).filter(
    (e) => e.userId === uid,
  )
  if (pending.length === 0) return

  // 1) fotos primeiro (sem foto no Storage não marcamos nada como sincronizado)
  for (const e of pending) {
    if (e.photo && !e.photoPath && !e.deleted) {
      const path = `${uid}/${e.id}.jpg`
      const { error } = await supabase!.storage
        .from(BUCKET)
        .upload(path, e.photo, { upsert: true, contentType: e.photo.type || 'image/jpeg' })
      if (error) throw error
      e.photoPath = path
      await db.expenses.update(e.id, { photoPath: path })
    }
  }

  // 2) upsert das linhas em lote
  const { error } = await mdb()
    .from('expenses')
    .upsert(pending.map(toRow), { onConflict: 'id' })
  if (error) throw error

  // 3) marca sincronizado SÓ se o registro não mudou durante o push
  for (const e of pending) {
    await db.expenses
      .where('id')
      .equals(e.id)
      .modify((row) => {
        if (row.updatedAt === e.updatedAt) row.sync = 'sincronizado'
      })
  }
}

/* ---------------- despesas: pull ---------------- */

async function pullExpenses(uid: string): Promise<void> {
  const key = `myrecibo.lastPull.${uid}`
  const since = localStorage.getItem(key)

  let query = mdb()
    .from('expenses')
    .select('*')
    .eq('user_id', uid)
    .order('updated_at', { ascending: true })
    .limit(1000)
  // margem de 5 min contra relógios/commits fora de ordem
  if (since) query = query.gt('updated_at', new Date(ts(since) - 5 * 60_000).toISOString())

  const { data, error } = await query
  if (error) throw error
  if (!data || data.length === 0) return

  let maxSeen = since ?? ''
  for (const row of data) {
    if (!maxSeen || ts(row.updated_at) > ts(maxSeen)) maxSeen = row.updated_at
    const local = await db.expenses.get(row.id)
    if (!local) {
      if (row.deleted) continue // tombstone de algo que nunca existiu aqui
      await db.expenses.add(fromRow(row))
      continue
    }
    // edição local pendente NUNCA é sobrescrita (será pushada e vence por LWW)
    if (local.sync !== 'sincronizado') continue
    if (ts(row.updated_at) <= ts(local.updatedAt)) continue
    await db.expenses.update(row.id, {
      ...fromRow(row),
      photo: local.photo, // preserva o blob local (a nuvem guarda o caminho)
    })
  }
  localStorage.setItem(key, maxSeen)
}

/* ---------------- perfil ---------------- */

async function pushProfile(uid: string): Promise<void> {
  const localTs = localStorage.getItem(PROFILE_TS_KEY)
  if (!localTs) return // nunca editado neste aparelho: nada a subir
  const p = getProfile()
  const { error } = await mdb()
    .from('profiles')
    .upsert(
      {
        id: uid,
        colaborador: p.colaborador,
        empresa: p.empresa,
        filial: p.filial,
        centro_custo: p.centroCusto,
        objetivo: p.objetivo,
        updated_at: localTs,
      },
      { onConflict: 'id' },
    )
  if (error) throw error
}

async function pullProfile(uid: string): Promise<void> {
  const { data, error } = await mdb().from('profiles').select('*').eq('id', uid).maybeSingle()
  if (error) throw error
  if (!data) return
  const localTs = localStorage.getItem(PROFILE_TS_KEY)
  if (localTs && ts(localTs) >= ts(data.updated_at)) return
  const p: Profile = {
    colaborador: data.colaborador ?? '',
    empresa: data.empresa ?? '',
    filial: data.filial ?? '',
    centroCusto: data.centro_custo ?? '',
    objetivo: data.objetivo ?? '',
  }
  saveProfile(p)
  localStorage.setItem(PROFILE_TS_KEY, data.updated_at)
}

/** Marca o perfil local como editado agora (chamado pelo Perfil ao salvar). */
export function touchProfile(): void {
  localStorage.setItem(PROFILE_TS_KEY, new Date().toISOString())
  scheduleSync(1500)
}

/* ---------------- foto sob demanda ---------------- */

/** Baixa a foto do Storage quando o registro local só tem o caminho
 *  (ex.: despesa criada em outro aparelho). Salva o blob no Dexie. */
export async function fetchPhoto(expense: Expense): Promise<Blob | null> {
  if (!supabase || !expense.photoPath || expense.photo) return expense.photo ?? null
  const { data, error } = await supabase.storage.from(BUCKET).download(expense.photoPath)
  if (error || !data) return null
  // cache local do blob, sem tocar em updatedAt/sync (não é uma edição)
  await db.expenses
    .where('id')
    .equals(expense.id)
    .modify((row) => {
      row.photo = data
    })
  return data
}

/* ---------------- mapeamento Dexie ⇄ Postgres ---------------- */

function toRow(e: Expense) {
  return {
    id: e.id,
    user_id: e.userId,
    date: e.date,
    amount: e.amount,
    payment_type: e.paymentType,
    category: e.category,
    vendor: e.vendor,
    description: e.description,
    invoice_number: e.invoiceNumber ?? null,
    source: e.source,
    reimbursement: e.reimbursement,
    photo_path: e.photoPath ?? null,
    deleted: e.deleted ?? false,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }
}

function fromRow(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    date: String(row.date),
    amount: Number(row.amount),
    paymentType: row.payment_type as Expense['paymentType'],
    category: row.category as Expense['category'],
    vendor: String(row.vendor ?? ''),
    description: String(row.description ?? ''),
    invoiceNumber: (row.invoice_number as string) ?? undefined,
    source: row.source as Expense['source'],
    reimbursement: row.reimbursement as Expense['reimbursement'],
    photoPath: (row.photo_path as string) ?? undefined,
    deleted: Boolean(row.deleted),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sync: 'sincronizado',
  }
}

function ts(iso: string): number {
  const n = Date.parse(iso)
  return Number.isNaN(n) ? 0 : n
}
