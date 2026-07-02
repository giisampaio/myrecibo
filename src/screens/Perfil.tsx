import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Building2, KeyRound, Loader2 } from 'lucide-react'
import { getProfile, saveProfile, type Profile } from '../lib/profile'
import { supabase, isSupabaseEnabled, mdb } from '../lib/supabase'
import { authErrorPt } from '../lib/auth'
import { touchProfile, syncNow } from '../lib/sync'
import AppShell from '../components/AppShell'
import Field from '../components/Field'
import Toast, { type ToastData } from '../components/Toast'

export default function Perfil() {
  const navigate = useNavigate()
  const [p, setP] = useState<Profile>(() => getProfile())
  const [toast, setToast] = useState<ToastData | null>(null)

  // conta
  const [email, setEmail] = useState('')
  const [newPass, setNewPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // empresa
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    mdb()
      .from('companies')
      .select('name')
      .maybeSingle()
      .then(({ data }) => setCompanyName(data?.name ?? null))
  }, [])

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => ({ ...prev, [key]: value }))
  }

  function onSaveProfile() {
    saveProfile(p)
    touchProfile() // marca a edição e agenda o sync do perfil
    navigate(-1)
  }

  async function onChangePassword() {
    if (!supabase || busy) return
    if (newPass.length < 6)
      return setToast({ message: 'A nova senha precisa de 6+ caracteres.', kind: 'error' })
    setBusy('senha')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      setNewPass('')
      setShowPass(false)
      setToast({ message: 'Senha alterada', kind: 'success' })
    } catch (err) {
      setToast({
        message: authErrorPt(err instanceof Error ? err.message : String(err)),
        kind: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  async function onJoinCompany() {
    if (!supabase || busy || !joinCode.trim()) return
    setBusy('empresa')
    try {
      const { data, error } = await mdb().rpc('join_company', { code: joinCode })
      if (error) throw error
      setCompanyName(String(data))
      setJoinCode('')
      setToast({ message: `Vinculado a ${data}`, kind: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setToast({
        message: msg.includes('inválido') ? 'Código de convite inválido.' : authErrorPt(msg),
        kind: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  async function onLogout() {
    if (!supabase) return
    if (!confirm('Sair da conta? Suas despesas continuam salvas neste aparelho.')) return
    await syncNow() // último backup antes de sair
    await supabase.auth.signOut()
  }

  return (
    <AppShell title="Perfil" back>
      {/* ---- Conta ---- */}
      {isSupabaseEnabled && (
        <section className="mb-6">
          <SectionTitle>Conta</SectionTitle>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-3 text-sm">
              <span className="block text-xs text-[var(--text-muted)]">E-mail</span>
              {email || '—'}
            </div>

            {showPass ? (
              <div className="mb-1">
                <Field label="Nova senha">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="input"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowPass(false)} className="btn-ghost">
                    Cancelar
                  </button>
                  <button onClick={onChangePassword} disabled={busy !== null} className="btn-primary">
                    {busy === 'senha' ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Salvar senha'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowPass(true)}
                className="press flex items-center gap-2 py-1 text-sm font-medium"
              >
                <KeyRound size={16} /> Trocar senha
              </button>
            )}

            <button
              onClick={onLogout}
              className="press mt-3 flex items-center gap-2 py-1 text-sm font-medium text-[var(--danger)]"
            >
              <LogOut size={16} /> Sair da conta
            </button>
          </div>
        </section>
      )}

      {/* ---- Empresa ---- */}
      {isSupabaseEnabled && (
        <section className="mb-6">
          <SectionTitle>Empresa</SectionTitle>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            {companyName ? (
              <div className="flex items-center gap-2 text-sm">
                <Building2 size={16} className="text-[var(--text-muted)]" />
                Vinculado a <b>{companyName}</b>
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  Tem um código de convite da sua empresa? Vincule para usar o modelo de
                  relatório dela.
                </p>
                <div className="flex gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="CÓDIGO"
                    autoCapitalize="characters"
                    className="input flex-1"
                  />
                  <button
                    onClick={onJoinCompany}
                    disabled={busy !== null || !joinCode.trim()}
                    className="btn-primary w-28"
                  >
                    {busy === 'empresa' ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Vincular'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* ---- Cabeçalho do relatório ---- */}
      <section>
        <SectionTitle>Cabeçalho dos relatórios</SectionTitle>
        <Field label="Empresa">
          <input value={p.empresa} onChange={(e) => set('empresa', e.target.value)} className="input" />
        </Field>
        <Field label="Colaborador">
          <input value={p.colaborador} onChange={(e) => set('colaborador', e.target.value)} className="input" />
        </Field>
        <Field label="Filial">
          <input value={p.filial} onChange={(e) => set('filial', e.target.value)} className="input" />
        </Field>
        <Field label="Centro de custo">
          <input value={p.centroCusto} onChange={(e) => set('centroCusto', e.target.value)} placeholder="Opcional" className="input" />
        </Field>
        <Field label="Objetivo da viagem">
          <input value={p.objetivo} onChange={(e) => set('objetivo', e.target.value)} className="input" />
        </Field>

        <button onClick={onSaveProfile} className="btn-primary mt-3">
          Salvar perfil
        </button>
      </section>

      <Toast toast={toast} onDone={() => setToast(null)} />
    </AppShell>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </h2>
  )
}
