import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Scanner from './screens/Scanner'
import Home from './screens/Home'
import NovaDespesa from './screens/NovaDespesa'
import ExpenseDetail from './screens/ExpenseDetail'
import ReciboManual from './screens/ReciboManual'
import Relatorio from './screens/Relatorio'
import Perfil from './screens/Perfil'
import Login from './screens/Login'
import { useSession } from './lib/auth'
import { startSync } from './lib/sync'

export default function App() {
  const { session, loading, enabled } = useSession()

  // Sincronização em segundo plano enquanto houver sessão
  useEffect(() => {
    if (session) return startSync(session.user.id)
  }, [session])

  // Supabase desligado (sem env): app 100% offline, sem login — como sempre
  if (enabled && loading) return null
  if (enabled && !session) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Scanner />} />
      <Route path="/despesas" element={<Home />} />
      <Route path="/nova" element={<NovaDespesa />} />
      <Route path="/despesa/:id" element={<ExpenseDetail />} />
      <Route path="/recibo" element={<ReciboManual />} />
      <Route path="/relatorio" element={<Relatorio />} />
      <Route path="/perfil" element={<Perfil />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
