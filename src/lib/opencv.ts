// Carrega o OpenCV.js sob demanda (só quando o scanner abre).
// Para uso 100% offline, hospede o opencv.js em /public/opencv/opencv.js;
// caso contrário, cai no CDN (cacheado pelo service worker após o 1º uso).

declare global {
  interface Window {
    cv?: any
    Module?: any
  }
}

const LOCAL_URL = `${import.meta.env.BASE_URL}opencv/opencv.js`
const CDN_URL = 'https://docs.opencv.org/4.10.0/opencv.js'

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

async function waitForRuntime(timeoutMs = 25000): Promise<any> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (window.cv && window.cv.Mat) return resolve(window.cv)
      if (window.cv && typeof window.cv.then === 'function') {
        window.cv.then((m: any) => resolve(m)).catch(reject)
        return
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('OpenCV timeout'))
      setTimeout(check, 80)
    }
    check()
  })
}

/** Retorna o objeto `cv` pronto para uso, ou rejeita se não conseguir carregar. */
export function loadOpenCV(): Promise<any> {
  if (promise) return promise
  promise = (async () => {
    if (window.cv && window.cv.Mat) return window.cv
    // Build padrão do OpenCV.js chama Module.onRuntimeInitialized
    window.Module = window.Module || {}
    try {
      await loadScript(LOCAL_URL)
    } catch {
      await loadScript(CDN_URL)
    }
    return waitForRuntime()
  })()
  return promise
}
