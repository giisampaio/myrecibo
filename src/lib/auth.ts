import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseEnabled, mdb } from './supabase'
import { getProfile } from './profile'
import { db } from '../db/db'

/**
 * Sessão do usuário. Com o Supabase desligado (sem env), `enabled` é false e
 * o app funciona como sempre (offline, sem login).
 */
export function useSession(): { session: Session | null; loading: boolean; enabled: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseEnabled)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading, enabled: isSupabaseEnabled }
}

/** Mensagens de erro do Supabase em português. */
export function authErrorPt(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).'
  if (m.includes('user already registered')) return 'Este e-mail já tem conta — use Entrar.'
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas — aguarde um instante.'
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexão. Verifique a internet.'
  return message
}

/**
 * Primeiro acesso de uma conta neste aparelho: garante a linha em
 * myrecibo.profiles (existir lá = ser usuário do MyRecibo) e ADOTA as
 * despesas locais sem dono (userId null) para esta conta.
 */
export async function onSignedIn(userId: string): Promise<void> {
  // adoção das despesas anônimas criadas antes do login
  await db.expenses
    .filter((e) => e.userId == null)
    .modify((e) => {
      e.userId = userId
      e.sync = 'local'
    })

  // perfil: cria se não existir (nunca sobrescreve um remoto mais novo aqui;
  // o merge fino acontece no sync)
  try {
    const { data } = await mdb().from('profiles').select('id').eq('id', userId).maybeSingle()
    if (!data) {
      const p = getProfile()
      await mdb().from('profiles').insert({
        id: userId,
        colaborador: p.colaborador,
        empresa: p.empresa,
        filial: p.filial,
        centro_custo: p.centroCusto,
        objetivo: p.objetivo,
        updated_at: new Date().toISOString(),
      })
    }
  } catch {
    /* offline ou schema ainda não exposto: o sync tenta de novo depois */
  }
}
