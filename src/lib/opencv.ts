// Carrega o OpenCV.js sob demanda (só quando o scanner abre).
// Para uso 100% offline, hospede o opencv.js em /public/opencv/opencv.js;
// caso contrário, cai no CDN (cacheado pelo service worker após o 1º uso).

declare global {
  interface Window {
    cv?: any
    Module?: any
  }
}

// Hospedado no próprio servidor (mesma origem, rápido e cacheável offline).
const LOCAL_URL = `${import.meta.env.BASE_URL}opencv/opencv.js`
// Fallback caso o arquivo local falte (URL válida do docs.opencv.org).
const CDN_URL = 'https://docs.opencv.org/4.x/opencv.js'

let promise: Promise<any> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`))
    document.head.appendChild(s)
  })
}

/** Retorna o objeto `cv` pronto para uso, ou rejeita se não conseguir carregar. */
export function loadOpenCV(): Promise<any> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) return resolve(window.cv)

    const settle = () => {
      const cv = window.cv
      if (!cv) return
      if (cv.Mat) return resolve(cv)
      if (typeof cv.then === 'function') cv.then(resolve).catch(reject) // build modularizado
    }

    // Sinal oficial do OpenCV.js
    window.Module = window.Module || {}
    window.Module.onRuntimeInitialized = settle

    // Tenta local (offline) e cai no CDN
    loadScript(LOCAL_URL)
      .catch(() => loadScript(CDN_URL))
      .catch((e) => reject(e))

    // Fallback por polling (alguns builds não chamam onRuntimeInitialized)
    const start = Date.now()
    const poll = () => {
      if (window.cv && window.cv.Mat) return resolve(window.cv)
      if (Date.now() - start > 60000) return reject(new Error('OpenCV demorou demais para carregar'))
      setTimeout(poll, 150)
    }
    setTimeout(poll, 800)
  })
  return promise
}
