import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Flashlight, Image as ImageIcon, Keyboard, Check, Camera } from 'lucide-react'
import { setPendingPhoto } from '../lib/pendingPhoto'
import { warmupScanner, whenScannerReady, detectDocument } from '../lib/scannerWorker'

const READY_WAIT_MS = 15000 // espera o OpenCV ficar pronto no worker
const PROCESS_MS = 15000 // tempo máximo para detectar/recortar

type Mode = 'camera' | 'review'

interface Result {
  blob: Blob
  url: string
  cropped: boolean
}

export default function Scanner() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

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
    // Pré-carrega o OpenCV no worker (persistente) já na abertura da câmera
    warmupScanner()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function process(src: HTMLCanvasElement) {
    let resultCanvas: HTMLCanvasElement = src
    let cropped = false

    const ctx = src.getContext('2d')
    if (ctx) {
      try {
        await withTimeout(whenScannerReady(), READY_WAIT_MS)
        const imgData = ctx.getImageData(0, 0, src.width, src.height)
        const res = await withTimeout(detectDocument(imgData, src.width, src.height), PROCESS_MS)
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
            <Camera size={44} className="text-white/70" />
            <p className="text-white/80">
              Não foi possível abrir a câmera. Permita o acesso ou escolha uma foto da galeria.
            </p>
            <label className="rounded-xl bg-white px-6 py-3 font-medium text-black active:opacity-90">
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
              <span className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                {result.cropped && <Check size={14} />}
                {result.cropped ? 'Bordas ajustadas' : 'Foto completa'}
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
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          aria-label="Fechar câmera"
        >
          <X size={20} />
        </button>
        {mode === 'camera' && hasTorch && (
          <button
            onClick={toggleTorch}
            className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur ${
              torchOn ? 'bg-white text-black' : 'bg-black/50 text-white'
            }`}
            aria-label="Lanterna"
          >
            <Flashlight size={20} />
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
              <label className="flex flex-col items-center gap-1 justify-self-start text-[11px] text-white/80">
                <ImageIcon size={22} />
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
                className="flex flex-col items-center gap-1 justify-self-end text-[11px] text-white/80"
              >
                <Keyboard size={22} />
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
              className="rounded-xl bg-white py-4 font-medium text-black active:opacity-90 disabled:opacity-40"
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
