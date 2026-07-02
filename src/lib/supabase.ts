import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Cliente Supabase opcional. Se as variáveis não estiverem configuradas,
 * o app continua 100% funcional offline (sem login e sem sincronização).
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseEnabled = supabase !== null

/**
 * Acesso ao schema dedicado do MyRecibo. O projeto Supabase é compartilhado
 * com o myhangar (que vive em `public`); todo o nosso banco fica em
 * `myrecibo` — separação total por construção.
 */
export function mdb() {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase.schema('myrecibo')
}
