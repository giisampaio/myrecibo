/*
 * Dono do Web Worker do scanner (singleton). O worker é criado uma única vez e
 * mantido vivo durante a sessão, então o OpenCV é baixado/inicializado só uma
 * vez — as fotos seguintes ficam instantâneas.
 */

export interface WorkerResult {
  found: boolean
  buffer?: ArrayBuffer
  width?: number
  height?: number
}

let worker: Worker | null = null
let ready: Promise<void> | null = null
let idCounter = 0
const pending = new Map<number, (r: WorkerResult) => void>()

function ensure(): { worker: Worker | null; ready: Promise<void> } {
  if (worker && ready) return { worker, ready }
  try {
    worker = new Worker('/scanner-worker.js')
  } catch {
    worker = null
    return { worker: null, ready: Promise.reject(new Error('worker indisponível')) }
  }
  ready = new Promise<void>((resolve) => {
    worker!.onmessage = (ev: MessageEvent) => {
      const m = ev.data
      if (m?.type === 'ready') {
        resolve()
      } else if (m?.type === 'result') {
        const r = pending.get(m.id)
        if (r) {
          pending.delete(m.id)
          r({ found: m.found, buffer: m.buffer, width: m.width, height: m.height })
        }
      }
    }
  })
  return { worker, ready }
}

/** Cria o worker e começa a carregar o OpenCV (chamar ao abrir a câmera). */
export function warmupScanner(): void {
  ensure()
}

/** Resolve quando o OpenCV estiver pronto no worker. */
export function whenScannerReady(): Promise<void> {
  return ensure().ready
}

/** Envia a imagem ao worker e devolve o recorte (ou found:false). */
export function detectDocument(imageData: ImageData, width: number, height: number): Promise<WorkerResult> {
  const w = ensure().worker
  if (!w) return Promise.resolve({ found: false })
  const id = ++idCounter
  return new Promise<WorkerResult>((resolve) => {
    pending.set(id, resolve)
    w.postMessage(
      { type: 'process', buffer: imageData.data.buffer, width, height, id },
      [imageData.data.buffer],
    )
  })
}
