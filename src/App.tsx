import { Routes, Route, Navigate } from 'react-router-dom'
import Scanner from './screens/Scanner'
import Home from './screens/Home'
import NovaDespesa from './screens/NovaDespesa'
import ExpenseDetail from './screens/ExpenseDetail'
import ReciboManual from './screens/ReciboManual'
import Relatorio from './screens/Relatorio'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Scanner />} />
      <Route path="/despesas" element={<Home />} />
      <Route path="/nova" element={<NovaDespesa />} />
      <Route path="/despesa/:id" element={<ExpenseDetail />} />
      <Route path="/recibo" element={<ReciboManual />} />
      <Route path="/relatorio" element={<Relatorio />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
