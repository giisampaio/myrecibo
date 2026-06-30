import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

interface Props {
  title: string
  children: ReactNode
  back?: boolean
  action?: ReactNode
}

export default function AppShell({ title, children, back, action }: Props) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="text-slate-300 active:text-white"
            aria-label="Voltar"
          >
            ‹ Voltar
          </button>
        )}
        <h1 className="flex-1 text-lg font-semibold text-white">{title}</h1>
        {action}
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <Tab to="/" label="Escanear" icon="📷" />
        <Tab to="/despesas" label="Despesas" icon="🧾" />
        <Tab to="/recibo" label="Recibo" icon="✍️" />
        <Tab to="/relatorio" label="Relatório" icon="📊" />
      </nav>
    </div>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 py-2 text-xs ${
          isActive ? 'text-sky-400' : 'text-slate-400'
        }`
      }
    >
      <span className="text-xl">{icon}</span>
      {label}
    </NavLink>
  )
}
