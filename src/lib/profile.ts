// Dados fixos do cabeçalho dos relatórios (perfil do colaborador/empresa).
// Guardado em localStorage — um único perfil, pré-preenchido com o modelo Scheffer.

export interface Profile {
  empresa: string
  colaborador: string
  filial: string
  centroCusto: string
  objetivo: string
}

const KEY = 'myrecibo.profile'

const DEFAULTS: Profile = {
  empresa: 'Scheffer & Cia Ltda',
  colaborador: 'GIOVANE SAMPAIO MACHADO JUNIOR',
  filial: 'Cuiabá',
  centroCusto: '',
  objetivo: 'AVIAÇÃO',
}

export function getProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}
