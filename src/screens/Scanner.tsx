import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setPendingPhoto } from '../lib/pendingPhoto'

const READY_WAIT_MS = 15000 // espera o OpenCV ficar pronto no worker
const PROCESS_MS = 15000 // tempo máximo para detectar/recortar

type Mode = 'camera' | 'review'

interface Result {
  blob: Blob
  url: string
  cropped: boolean
}

interface WorkerResult {
  found: boolean
  buffer?: ArrayBuffer
  width?: number
  height?: number
}

export default function Scanner() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Worker do OpenCV (fora da thread principal — não trava a câmera)
  const workerRef = useRef<Worker | null>(null)
  const readyRef = useRef<Promise<void> | null>(null)
  const pendingRef = useRef<{ id: number; resolve: (r: WorkerResult) => void } | null>(null)
  const idRef = useRef(0)

  const [mode, setMode] = useState<Mode>('camera')
  const [cameraError, setCameraError] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const [fullUrl, setFullUrl] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [processing, setProcessing] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    startCamera()
    startWorker()
    return () => {
      stopCamera()
      workerRef.current?.terminate()
      workerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startWorker() {
    try {
      const worker = new Worker('/scanner-worker.js')
      workerRef.current = worker
      readyRef.current = new Promise<void>((resolve) => {
        worker.onmessage = (ev: MessageEvent) => {
          const m = ev.data
          if (m?.type === 'ready') {
            resolve()
          } else if (m?.type === 'result') {
            const pending = pendingRef.current
            if (pending && pending.id === m.id) {
              pendingRef.current = null
              pending.resolve({ found: m.found, buffer: m.buffer, width: m.width, height: m.height })
            }
          }
        }
      })
      // Pré-carrega o OpenCV no worker já na abertura (não bloqueia a câmera)
      readyRef.current.catch(() => {})
    } catch {
      workerRef.current = null
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) return
      v.srcObject = stream
      await v.play()
      const track = stream.getVideoTracks()[0]
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean }
      if (caps.torch) setHasTorch(true)
    } catch {
      setCameraError(true)
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const constraints = { advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints
      await track.applyConstraints(constraints)
      setTorchOn((t) => !t)
    } catch {
      /* sem suporte */
    }
  }

  /* ---------- captura ---------- */

  function capturePhoto() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    beginReview(c)
  }

  function onPickFromGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d')?.drawImage(img, 0, 0)
      URL.revokeObjectURL(img.src)
      beginReview(c)
    }
    img.src = URL.createObjectURL(file)
  }

  function beginReview(src: HTMLCanvasElement) {
    setAnimateIn(false)
    setResult(null)
    setFullUrl(src.toDataURL('image/jpeg', 0.9))
    setProcessing(true)
    setMode('review')
    void process(src)
  }

  /** Envia a imagem ao worker e aguarda o recorte (ou desiste no timeout). */
  function detectInWorker(src: HTMLCanvasElement): Promise<WorkerResult> {
    const worker = workerRef.current
    if (!worker) return Promise.resolve({ found: false })
    const ctx = src.getContext('2d')
    if (!ctx) return Promise.resolve({ found: false })
    const imgData = ctx.getImageData(0, 0, src.width, src.height)
    const id = ++idRef.current
    return new Promise<WorkerResult>((resolve) => {
      pendingRef.current = { id, resolve }
      worker.postMessage(
        { type: 'process', buffer: imgData.data.buffer, width: src.width, height: src.height, id },
        [imgData.data.buffer],
      )
    })
  }

  async function process(src: HTMLCanvasElement) {
    let resultCanvas: HTMLCanvasElement = src
    let cropped = false

    if (workerRef.current && readyRef.current) {
      try {
        await withTimeout(readyRef.current, READY_WAIT_MS)
        const res = await withTimeout(detectInWorker(src), PROCESS_MS)
        if (res.found && res.buffer && res.width && res.height) {
          const out = new ImageData(new Uint8ClampedArray(res.buffer), res.width, res.height)
          const cc = document.createElement('canvas')
          cc.width = res.width
          cc.height = res.height
          cc.getContext('2d')?.putImageData(out, 0, 0)
          resultCanvas = cc
          cropped = true
        }
      } catch {
        /* timeout / sem OpenCV: mantém a foto inteira */
        pendingRef.current = null
      }
    }

    const blob = await canvasToBlob(resultCanvas)
    setResult({ blob, url: URL.createObjectURL(blob), cropped })
    setProcessing(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }

  /* ---------- ações da revisão ---------- */

  function onUse() {
    if (!result) return
    setPendingPhoto(result.blob)
    stopCamera()
    navigate('/nova')
  }

  function onRetake() {
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    setFullUrl('')
    setAnimateIn(false)
    setMode('camera')
  }

  /* ---------- render ---------- */

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
        />

        {mode === 'camera' && !cameraError && (
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/40" />
        )}

        {cameraError && mode === 'camera' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="text-5xl">📷</span>
            <p className="text-slate-200">
              Não foi possível abrir a câmera. Permita o acesso ou escolha uma foto da galeria.
            </p>
            <label className="rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white active:bg-sky-600">
              Escolher da galeria
              <input type="file" accept="image/*" className="hidden" onChange={onPickFromGallery} />
            </label>
          </div>
        )}

        {mode === 'review' && (
          <div className="absolute inset-0 bg-black">
            {fullUrl && (
              <img
                src={fullUrl}
                alt=""
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
                  animateIn ? 'opacity-0' : 'opacity-100'
                }`}
              />
            )}
            {result && (
              <img
                src={result.url}
                alt="Documento"
                className={`absolute inset-0 h-full w-full object-contain transition-all duration-500 ease-out ${
                  animateIn ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
                }`}
              />
            )}

            {processing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                <span className="text-sm text-white/90">Recortando documento…</span>
              </div>
            )}

            {result && !processing && (
              <span
                className={`absolute left-1/2 top-20 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium backdrop-blur ${
                  result.cropped ? 'bg-emerald-500/25 text-emerald-200' : 'bg-slate-500/30 text-slate-200'
                }`}
              >
                {result.cropped ? '✓ Bordas ajustadas' : 'Foto completa'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Barra superior */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={() => {
            stopCamera()
            navigate('/despesas')
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-xl text-white backdrop-blur"
          aria-label="Fechar câmera"
        >
          ✕
        </button>
        {mode === 'camera' && hasTorch && (
          <button
            onClick={toggleTorch}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-xl backdrop-blur ${
              torchOn ? 'bg-amber-400 text-black' : 'bg-black/50 text-white'
            }`}
            aria-label="Lanterna"
          >
            🔦
          </button>
        )}
      </div>

      {/* Controles inferiores */}
      <div className="absolute inset-x-0 bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        {mode === 'camera' ? (
          <>
            <p className="mb-4 text-center text-sm text-white/90 drop-shadow">
              Enquadre o comprovante e toque para fotografar
            </p>
            <div className="grid grid-cols-3 items-center px-8">
              <label className="justify-self-start text-sm text-white/80">
                Galeria
                <input type="file" accept="image/*" className="hidden" onChange={onPickFromGallery} />
              </label>
              <button
                onClick={capturePhoto}
                disabled={cameraError}
                className="h-20 w-20 justify-self-center rounded-full border-4 border-white bg-white/30 p-1 active:bg-white/50 disabled:opacity-40"
                aria-label="Tirar foto"
              >
                <span className="block h-full w-full rounded-full bg-white" />
              </button>
              <button
                onClick={() => {
                  stopCamera()
                  navigate('/nova')
                }}
                className="justify-self-end text-sm text-white/80"
              >
                Digitar
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-8">
            <button
              onClick={onRetake}
              className="rounded-xl border border-white/40 py-4 font-semibold text-white active:bg-white/10"
            >
              Refazer
            </button>
            <button
              onClick={onUse}
              disabled={!result || processing}
              className="rounded-xl bg-sky-500 py-4 font-semibold text-white active:bg-sky-600 disabled:opacity-40"
            >
              Usar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- helpers ---------- */

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.9)
  })
}
