import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseEnabled } from './supabase'
import { scheduleSync } from './sync'

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
 * Pós-login: só agenda um ciclo de sync. A adoção das despesas locais e a
 * criação do perfil acontecem DENTRO do ciclo (sync.ts) — assim nenhum
 * caminho de login (formulário, link de confirmação, recuperação) fica sem.
 */
export async function onSignedIn(_userId: string): Promise<void> {
  scheduleSync(500)
}
