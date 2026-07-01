import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, saveProfile, type Profile } from '../lib/profile'
import AppShell from '../components/AppShell'
import Field from '../components/Field'

export default function Perfil() {
  const navigate = useNavigate()
  const [p, setP] = useState<Profile>(() => getProfile())

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => ({ ...prev, [key]: value }))
  }

  function onSave() {
    saveProfile(p)
    navigate(-1)
  }

  return (
    <AppShell title="Perfil do relatório" back>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        Dados fixos do cabeçalho dos relatórios (Cartão e Reembolso).
      </p>

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

      <button onClick={onSave} className="btn-primary mt-4">
        Salvar perfil
      </button>
    </AppShell>
  )
}
