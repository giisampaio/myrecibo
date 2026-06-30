import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import jscanify from 'jscanify/client'
import type { Corner, CornerPoints } from 'jscanify/client'
import { loadOpenCV } from '../lib/opencv'
import { setPendingPhoto } from '../lib/pendingPhoto'

const PROC_W = 480
const STABLE_MS = 700
const STABLE_PX = 6

type Phase = 'init' | 'searching' | 'detected' | 'denied' | 'error'

export default function Scanner() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const procRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const streamRef = useRef<MediaStream | null>(null)
  const scannerRef = useRef<jscanify | null>(null)
  const cvRef = useRef<any>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const lastTickRef = useRef(0)
  const lastCornersRef = useRef<Required<CornerPoints> | null>(null)
  const stableSinceRef = useRef<number | null>(null)
  const capturedRef = useRef(false)
  const phaseRef = useRef<Phase>('init')

  const [phase, setPhaseState] = useState<Phase>('init')
  const [cvEnabled, setCvEnabled] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  function setPhase(p: Phase) {
    if (phaseRef.current !== p) {
      phaseRef.current = p
      setPhaseState(p)
    }
  }

  useEffect(() => {
    startCamera()
    loadOpenCV()
      .then((cv) => {
        cvRef.current = cv
        scannerRef.current = new jscanify()
        setCvEnabled(true)
      })
      .catch(() => setCvEnabled(false))
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
      setPhase('searching')
      lastTickRef.current = 0
      rafRef.current = requestAnimationFrame(loop)
    } catch {
      setPhase('denied')
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function loop(ts: number) {
    if (capturedRef.current) return
    if (ts - lastTickRef.current >= 90) {
      lastTickRef.current = ts
      detect()
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function detect() {
    const v = videoRef.current
    const overlay = overlayRef.current
    if (!v || !overlay || v.readyState < 2 || !v.videoWidth) return

    const dispW = v.clientWidth
    const dispH = v.clientHeight
    if (overlay.width !== dispW) overlay.width = dispW
    if (overlay.height !== dispH) overlay.height = dispH
    const octx = overlay.getContext('2d')
    if (!octx) return
    octx.clearRect(0, 0, dispW, dispH)

    const cv = cvRef.current
    const scanner = scannerRef.current
    if (!cv || !scanner) return

    const ph = Math.round((v.videoHeight * PROC_W) / v.videoWidth)
    const proc = procRef.current
    proc.width = PROC_W
    proc.height = ph
    proc.getContext('2d')?.drawImage(v, 0, 0, PROC_W, ph)

    let img: any
    try {
      img = cv.imread(proc)
      const contour = scanner.findPaperContour(img)
      if (contour) {
        const c = scanner.getCornerPoints(contour)
        if (isQuad(c) && quadArea(c) > 0.12 * PROC_W * ph) {
          const corners = c as Required<CornerPoints>
          drawQuad(octx, corners, dispW / PROC_W, dispH / ph, stableProgress())
          updateStability(corners)
          setPhase('detected')
          return
        }
      }
    } catch {
      /* frame inválido — ignora */
    } finally {
      try {
        img?.delete()
      } catch {
        /* noop */
      }
    }

    stableSinceRef.current = null
    lastCornersRef.current = null
    setPhase('searching')
  }

  function stableProgress(): number {
    if (!stableSinceRef.current) return 0
    return Math.min(1, (performance.now() - stableSinceRef.current) / STABLE_MS)
  }

  function updateStability(corners: Required<CornerPoints>) {
    const prev = lastCornersRef.current
    lastCornersRef.current = corners
    if (prev && maxCornerShift(prev, corners) < STABLE_PX) {
      if (!stableSinceRef.current) stableSinceRef.current = performance.now()
      else if (performance.now() - stableSinceRef.current >= STABLE_MS) {
        capture(corners)
      }
    } else {
      stableSinceRef.current = performance.now()
    }
  }

  function capture(cornersProc: Required<CornerPoints> | null) {
    if (capturedRef.current) return
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    capturedRef.current = true

    const full = document.createElement('canvas')
    full.width = v.videoWidth
    full.height = v.videoHeight
    full.getContext('2d')?.drawImage(v, 0, 0)

    let out: HTMLCanvasElement | null = null
    const scanner = scannerRef.current
    if (scanner && cornersProc) {
      const sx = v.videoWidth / procRef.current.width
      const sy = v.videoHeight / procRef.current.height
      const corners = scaleCorners(cornersProc, sx, sy)
      const { w, h } = quadSize(corners)
      try {
        out = scanner.extractPaper(full, Math.max(120, Math.round(w)), Math.max(120, Math.round(h)), corners)
      } catch {
        out = null
      }
    }
    const result = out ?? full
    result.toBlob(
      (blob) => {
        if (!blob) {
          capturedRef.current = false
          return
        }
        setPendingPhoto(blob)
        stopCamera()
        navigate('/nova')
      },
      'image/jpeg',
      0.9,
    )
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      // `torch` ainda não está nos tipos padrão do TS
      const constraints = { advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints
      await track.applyConstraints(constraints)
      setTorchOn((t) => !t)
    } catch {
      /* sem suporte */
    }
  }

  function onPickFromGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingPhoto(file)
    navigate('/nova')
  }

  const hint =
    phase === 'denied'
      ? 'Sem acesso à câmera'
      : phase === 'detected'
        ? 'Segure firme… capturando'
        : cvEnabled
          ? 'Aponte para o comprovante'
          : 'Toque no botão para fotografar'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Câmera */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {phase === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="text-5xl">📷</span>
            <p className="text-slate-200">
              Não foi possível abrir a câmera. Permita o acesso nas configurações ou escolha uma
              foto da galeria.
            </p>
            <label className="rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white active:bg-sky-600">
              Escolher da galeria
              <input type="file" accept="image/*" className="hidden" onChange={onPickFromGallery} />
            </label>
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
        {hasTorch && (
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
        <p className="mb-4 text-center text-sm text-white/90 drop-shadow">{hint}</p>
        <div className="grid grid-cols-3 items-center px-8">
          <label className="justify-self-start text-sm text-white/80">
            Galeria
            <input type="file" accept="image/*" className="hidden" onChange={onPickFromGallery} />
          </label>

          <button
            onClick={() => capture(lastCornersRef.current)}
            disabled={phase === 'denied'}
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
      </div>
    </div>
  )
}

/* ---------- helpers de geometria ---------- */

function isQuad(c: CornerPoints): c is Required<CornerPoints> {
  return !!(c.topLeftCorner && c.topRightCorner && c.bottomLeftCorner && c.bottomRightCorner)
}

function quadArea(c: Required<CornerPoints>): number {
  const p = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner]
  let a = 0
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    a += p[i].x * p[j].y - p[j].x * p[i].y
  }
  return Math.abs(a / 2)
}

function quadSize(c: Required<CornerPoints>): { w: number; h: number } {
  const top = dist(c.topLeftCorner, c.topRightCorner)
  const bottom = dist(c.bottomLeftCorner, c.bottomRightCorner)
  const left = dist(c.topLeftCorner, c.bottomLeftCorner)
  const right = dist(c.topRightCorner, c.bottomRightCorner)
  return { w: (top + bottom) / 2, h: (left + right) / 2 }
}

function scaleCorners(
  c: Required<CornerPoints>,
  sx: number,
  sy: number,
): Required<CornerPoints> {
  const s = (p: Corner): Corner => ({ x: p.x * sx, y: p.y * sy })
  return {
    topLeftCorner: s(c.topLeftCorner),
    topRightCorner: s(c.topRightCorner),
    bottomLeftCorner: s(c.bottomLeftCorner),
    bottomRightCorner: s(c.bottomRightCorner),
  }
}

function maxCornerShift(a: Required<CornerPoints>, b: Required<CornerPoints>): number {
  return Math.max(
    dist(a.topLeftCorner, b.topLeftCorner),
    dist(a.topRightCorner, b.topRightCorner),
    dist(a.bottomLeftCorner, b.bottomLeftCorner),
    dist(a.bottomRightCorner, b.bottomRightCorner),
  )
}

function dist(p1: Corner, p2: Corner): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  c: Required<CornerPoints>,
  sx: number,
  sy: number,
  progress: number,
) {
  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner]
  ctx.beginPath()
  ctx.moveTo(pts[0].x * sx, pts[0].y * sy)
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy)
  ctx.closePath()
  const green = progress > 0.05
  ctx.fillStyle = green ? `rgba(16,185,129,${0.15 + progress * 0.2})` : 'rgba(56,189,248,0.12)'
  ctx.fill()
  ctx.strokeStyle = green ? '#10b981' : '#38bdf8'
  ctx.lineWidth = 4
  ctx.stroke()
}
