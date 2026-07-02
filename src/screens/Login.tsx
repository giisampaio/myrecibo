import { useState } from 'react'
import { ReceiptText, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { authErrorPt, onSignedIn } from '../lib/auth'
import Field from '../components/Field'

type Mode = 'entrar' | 'criar' | 'reset'

/**
 * Porta de entrada (login obrigatório, uma única vez com internet).
 * Depois disso a sessão fica no aparelho e o app é 100% offline.
 */
export default function Login() {
  const [mode, setMode] = useState<Mode>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function onSubmit() {
    if (!supabase || busy) return
    setError('')
    setNotice('')
    const mail = email.trim().toLowerCase()
    if (!mail.includes('@')) return setError('Informe um e-mail válido.')
    if (mode !== 'reset' && password.length < 6)
      return setError('A senha precisa ter pelo menos 6 caracteres.')

    setBusy(true)
    try {
      if (mode === 'entrar') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: mail,
          password,
        })
        if (error) throw error
        if (data.user) await onSignedIn(data.user.id)
      } else if (mode === 'criar') {
        const { data, error } = await supabase.auth.signUp({ email: mail, password })
        if (error) throw error
        if (data.session && data.user) {
          await onSignedIn(data.user.id)
        } else {
          setNotice('Conta criada! Confirme seu e-mail (veja a caixa de entrada) e depois entre.')
          setMode('entrar')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setNotice('Enviamos um link de recuperação para o seu e-mail.')
        setMode('entrar')
      }
    } catch (err) {
      setError(authErrorPt(err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Recuperar senha'
  const cta =
    mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Enviar link'

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg)] px-[var(--screen-x)] text-[var(--text)]">
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ink)] text-[var(--ink-contrast)]">
            <ReceiptText size={30} />
          </div>
          <h1 className="text-2xl font-semibold">MyRecibo</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Despesas de viagem sem esforço
          </p>
        </div>

        <h2 className="mb-4 text-base font-medium">{title}</h2>

        <Field label="E-mail">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            className="input"
          />
        </Field>

        {mode !== 'reset' && (
          <Field label="Senha">
            <input
              type="password"
              autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="input"
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            />
          </Field>
        )}

        {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
        {notice && <p className="mb-3 text-sm text-[var(--status-pago)]">{notice}</p>}

        <button onClick={onSubmit} disabled={busy} className="btn-primary mt-1">
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> Aguarde…
            </span>
          ) : (
            cta
          )}
        </button>

        <div className="mt-5 flex flex-col items-center gap-3 text-sm">
          {mode !== 'entrar' && (
            <button onClick={() => setMode('entrar')} className="press font-medium">
              Já tenho conta — entrar
            </button>
          )}
          {mode === 'entrar' && (
            <>
              <button onClick={() => setMode('criar')} className="press font-medium">
                Criar conta
              </button>
              <button
                onClick={() => setMode('reset')}
                className="press text-[var(--text-muted)]"
              >
                Esqueci minha senha
              </button>
            </>
          )}
        </div>
      </div>

      <p className="pb-[max(16px,env(safe-area-inset-bottom))] text-center text-[11px] text-[var(--text-muted)]">
        Você entra uma vez; depois o app funciona offline.
      </p>
    </div>
  )
}
