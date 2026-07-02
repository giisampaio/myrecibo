import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Flashlight, Image as ImageIcon, Keyboard, Check, Camera } from 'lucide-react'
import { setPendingPhoto } from '../lib/pendingPhoto'
import { warmupScanner, whenScannerReady, detectDocument } from '../lib/scannerWorker'
import { warmupOcr } from '../lib/ocr'
import { getNativeCamera, isCameraHintDismissed, dismissCameraHint } from '../lib/prefs'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [mode, setMode] = useState<Mode>('camera')
  const [cameraError, setCameraError] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  // Câmera nativa do iPhone: sem getUserMedia = sem aviso de permissão
  const [native] = useState(() => getNativeCamera())
  const [showHint, setShowHint] = useState(() => getNativeCamera() === false && !isCameraHintDismissed())

  const [fullUrl, setFullUrl] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [processing, setProcessing] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (!native) startCamera() // no modo nativo NADA de getUserMedia (zero prompt)
    // Pré-carrega o OpenCV no worker (persistente) já na abertura da câmera
    warmupScanner()
    // Pré-carrega o leitor de cupom (modelos do OCR) enquanto o usuário enquadra
    warmupOcr()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Exibe a câmera num canvas (sem o overlay nativo do <video>); ~30fps, object-cover.
  useEffect(() => {
    if (mode !== 'camera' || native) return
    let raf = 0
    let last = 0
    const draw = () => {
      const v = videoRef.current
      const c = canvasRef.current
      if (v && c && v.videoWidth && v.readyState >= 2) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.round(c.clientWidth * dpr)
        const h = Math.round(c.clientHeight * dpr)
        if (w && h && (c.width !== w || c.height !== h)) {
          c.width = w
          c.height = h
        }
        const ctx = c.getContext('2d')
        if (ctx && c.width && c.height) {
          const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight)
          const dw = v.videoWidth * s
          const dh = v.videoHeight * s
          ctx.drawImage(v, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh)
        }
      }
    }
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 33) return
      last = t
      draw()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mode])

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
        {/* Fonte oculta: o <video> alimenta o canvas (sem o overlay nativo do iOS) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
        <canvas ref={canvasRef} className="relative block h-full w-full" />

        {mode === 'camera' && !cameraError && !native && <CornerGuide />}

        {mode === 'camera' && native && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center">
            <Camera size={46} className="text-white/70" />
            <p className="text-base font-medium text-white">Câmera do iPhone</p>
            <p className="text-sm text-white/60">
              A foto volta pro app com recorte e leitura automáticos — sem aviso de permissão.
            </p>
          </div>
        )}

        {mode === 'camera' && !native && showHint && (
          <div
            className="absolute inset-x-4 flex items-start gap-2 rounded-xl bg-black/60 p-3 text-xs text-white/90 backdrop-blur"
            style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}
          >
            <span className="flex-1">
              Para o iPhone parar de pedir a câmera: <b>Ajustes → Apps → MyRecibo → Câmera →
              Permitir</b>. Ou ative a câmera nativa no Perfil.
            </span>
            <button
              onClick={() => {
                dismissCameraHint()
                setShowHint(false)
              }}
              aria-label="Fechar dica"
              className="shrink-0 rounded-full bg-white/15 p-1"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {cameraError && mode === 'camera' && !native && (
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
              <span className="absolute left-1/2 top-24 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                {result.cropped && <Check size={14} />}
                {result.cropped ? 'Bordas ajustadas' : 'Foto completa'}
              </span>
            )}
          </div>
        )}

        {/* Scrims para legibilidade dos controles */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))' }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))' }}
        />
        {/* Faixa sólida atrás da barra de status (camera não invade o relógio/bateria) */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 bg-black"
          style={{ height: 'env(safe-area-inset-top)' }}
        />
      </div>

      {/* Barra superior */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <button
          onClick={() => {
            stopCamera()
            navigate('/despesas')
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur active:bg-black/70"
          aria-label="Fechar câmera"
        >
          <X size={22} />
        </button>
        {mode === 'camera' && hasTorch && (
          <button
            onClick={toggleTorch}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur active:opacity-80 ${
              torchOn ? 'bg-white text-black' : 'bg-black/45 text-white'
            }`}
            aria-label="Lanterna"
          >
            <Flashlight size={22} />
          </button>
        )}
      </div>

      {/* Controles inferiores */}
      <div
        className="absolute inset-x-0 bottom-0 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}
      >
        {mode === 'camera' ? (
          <>
            <p className="mb-5 text-center text-sm text-white/90 drop-shadow">
              {native
                ? 'Toque para abrir a câmera do iPhone'
                : 'Enquadre o comprovante e toque para fotografar'}
            </p>
            <div className="grid grid-cols-3 items-center px-10">
              <label className="press flex flex-col items-center gap-1 justify-self-start text-[11px] text-white/80">
                <ImageIcon size={24} />
                Galeria
                <input type="file" accept="image/*" className="hidden" onChange={onPickFromGallery} />
              </label>
              {native ? (
                <label
                  className="h-[76px] w-[76px] justify-self-center rounded-full border-4 border-white bg-white/25 p-1 active:bg-white/50"
                  aria-label="Abrir a câmera do iPhone"
                >
                  <span className="block h-full w-full rounded-full bg-white" />
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={onPickFromGallery}
                  />
                </label>
              ) : (
                <button
                  onClick={capturePhoto}
                  disabled={cameraError}
                  className="h-[76px] w-[76px] justify-self-center rounded-full border-4 border-white bg-white/25 p-1 active:bg-white/50 disabled:opacity-40"
                  aria-label="Tirar foto"
                >
                  <span className="block h-full w-full rounded-full bg-white" />
                </button>
              )}
              <button
                onClick={() => {
                  stopCamera()
                  navigate('/nova')
                }}
                className="press flex flex-col items-center gap-1 justify-self-end text-[11px] text-white/80"
              >
                <Keyboard size={24} />
                Digitar
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-8">
            <button
              onClick={onRetake}
              className="rounded-xl border border-white/40 py-4 font-medium text-white active:bg-white/10"
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

function CornerGuide() {
  const base = 'absolute h-7 w-7 border-white/70'
  return (
    <div className="pointer-events-none absolute inset-8">
      <span className={`${base} left-0 top-0 rounded-tl-xl border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 rounded-tr-xl border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 rounded-bl-xl border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 rounded-br-xl border-b-2 border-r-2`} />
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
