import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ScanLine, Receipt, PenLine, BarChart3, ChevronLeft, type LucideIcon } from 'lucide-react'

interface Props {
  title: string
  children: ReactNode
  back?: boolean
  action?: ReactNode
}

export default function AppShell({ title, children, back, action }: Props) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-full flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="-ml-2 flex items-center text-[var(--text-muted)]"
            aria-label="Voltar"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className="flex-1 text-lg font-medium">{title}</h1>
        {action}
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--bg)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <Tab to="/" label="Escanear" Icon={ScanLine} />
        <Tab to="/despesas" label="Despesas" Icon={Receipt} />
        <Tab to="/recibo" label="Recibo" Icon={PenLine} />
        <Tab to="/relatorio" label="Relatório" Icon={BarChart3} />
      </nav>
    </div>
  )
}

function Tab({ to, label, Icon }: { to: string; label: string; Icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-2.5 text-[11px] ${
          isActive ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
        }`
      }
    >
      <Icon size={22} strokeWidth={1.75} />
      {label}
    </NavLink>
  )
}
