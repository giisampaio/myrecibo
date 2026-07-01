import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Pede armazenamento persistente: sem isso o iOS pode limpar o IndexedDB
// (onde vivem as fotos dos comprovantes) quando o aparelho está cheio.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}

// Nova versão publicada: mostra uma barra pedindo para atualizar
// (evita o app ficar preso numa versão antiga em cache).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    showUpdateBar(() => updateSW(true))
  },
})

function showUpdateBar(onUpdate: () => void) {
  if (document.getElementById('sw-update-bar')) return
  const bar = document.createElement('div')
  bar.id = 'sw-update-bar'
  bar.setAttribute('role', 'status')
  bar.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 76px);' +
    'z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:12px;' +
    'padding:12px 16px;border-radius:14px;background:var(--ink);color:var(--ink-contrast);' +
    'font:500 14px -apple-system,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)'
  const label = document.createElement('span')
  label.textContent = 'Nova versão disponível'
  const btn = document.createElement('button')
  btn.textContent = 'Atualizar'
  btn.style.cssText =
    'border:0;border-radius:10px;padding:8px 14px;background:var(--ink-contrast);' +
    'color:var(--ink);font:600 14px inherit;cursor:pointer'
  btn.onclick = onUpdate
  bar.append(label, btn)
  document.body.appendChild(bar)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
