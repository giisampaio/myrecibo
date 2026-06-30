# MyRecibo

PWA (instalável no iPhone) para tripulantes registrarem despesas com o mínimo de esforço:
foto do comprovante → OCR preenche valor/data → escolher **Corporativo** ou **Pessoal** → salvar.
Funciona **offline**; gera o **PDF de comprovantes** e a **planilha** do mês; e tem um
**gerador de recibo manual** com 3 modelos.

## Stack

- **Vite + React + TypeScript** (SPA), instalável como app no iPhone (PWA)
- **vite-plugin-pwa / Workbox** — funciona offline
- **Dexie (IndexedDB)** — banco local, fonte da verdade no aparelho
- **Tesseract.js** — OCR no próprio celular, sem custo (carregado sob demanda)
- **Supabase** (opcional) — login multiusuário + sincronização + storage das fotos
- **pdf-lib** — PDF consolidado e recibos manuais
- **SheetJS (xlsx)** — exportação da planilha

## Rodar localmente

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build de produção (gera o service worker da PWA)
npm run preview   # serve o build
```

Para sincronizar com o Supabase, copie `.env.example` para `.env` e preencha
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Sem isso, o app roda 100% offline/local.

## O que já funciona

- ✅ **Scanner como tela inicial** (`/`): abre a câmera ao iniciar, detecta as bordas do
  comprovante (OpenCV.js + jscanify), **captura sozinho** ao estabilizar e corrige a
  perspectiva. Botão **✕** fecha a câmera; **Galeria** e **Digitar** como alternativas.
- ✅ Tela de despesas do mês com totais separados (Corporativo × Pessoal/reembolso)
- ✅ Nova despesa com foto + OCR (valor/data) + categoria + forma de pagamento
- ✅ Recibo manual com 3 modelos (Clássico / Moderno / Minimalista), com valor por extenso
- ✅ Relatório: PDF dos comprovantes (resumo + 1 página por foto/recibo) e planilha .xlsx
- ✅ Armazenamento offline (IndexedDB)

## Testar a câmera/scanner

A câmera (`getUserMedia`) **só funciona em HTTPS ou em `localhost`**. Para testar no iPhone
na rede local (`http://IP:5173`) o navegador bloqueia a câmera. Opções:

- Testar no próprio computador em `http://localhost:5173`, ou
- Expor via HTTPS (ex.: `cloudflared tunnel`/`ngrok`), ou
- Fazer o deploy (EasyPanel já serve em HTTPS) e abrir pelo Safari do iPhone.

## Próximos passos

1. **Modelo de planilha do financeiro** — mapear as colunas reais em `src/lib/exporters.ts`
   (`exportXLSX`). Hoje usa um modelo padrão. *(aguardando a planilha-modelo)*
2. **Sincronização Supabase** — criar tabela `expenses` (com RLS por usuário), bucket de
   storage para as fotos, login, e a fila de sync em `src/db`. O cliente já está em
   `src/lib/supabase.ts`.
3. **OCR/Scanner 100% offline** — hoje OpenCV.js e Tesseract carregam de CDN e ficam em
   cache após o 1º uso online (via service worker). Para funcionar offline já na 1ª vez,
   hospedar localmente: `opencv.js` em `/public/opencv/opencv.js` (o loader já tenta esse
   caminho antes do CDN) e os assets do Tesseract (`por.traineddata` + core wasm).
4. **Ícones da PWA** — gerar `pwa-192x192.png`, `pwa-512x512.png` e `apple-touch-icon.png`
   em `/public` (hoje só há `favicon.svg`).
5. **Deploy** — container estático na VPS (DigitalOcean + EasyPanel): `npm run build` e
   servir a pasta `dist/`.

## Observações

- `npm audit` aponta 1 vulnerabilidade no `xlsx` publicado no npm. Para produção, considerar
  instalar o SheetJS pelo CDN oficial (https://cdn.sheetjs.com) conforme recomendação deles.
- OCR de cupom térmico erra com frequência; os campos são sempre editáveis.
