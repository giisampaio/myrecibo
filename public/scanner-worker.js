/*
 * Web Worker do scanner: roda o OpenCV.js FORA da thread principal, para a
 * câmera/UI nunca travarem. Detecta as bordas do documento e devolve a imagem
 * já recortada e com perspectiva corrigida.
 */
/* eslint-disable */

let ready = false

// Injeta o callback ANTES de carregar o opencv.js (o build usa `cv` como Module)
self.cv = {
  onRuntimeInitialized() {
    ready = true
    postMessage({ type: 'ready' })
  },
}

try {
  importScripts('/opencv/opencv.js')
} catch (e) {
  postMessage({ type: 'error', message: 'importScripts: ' + e })
}

// Fallback: alguns ambientes não disparam onRuntimeInitialized
;(function poll() {
  if (ready) return
  if (self.cv && self.cv.Mat) {
    ready = true
    postMessage({ type: 'ready' })
    return
  }
  setTimeout(poll, 100)
})()

onmessage = (ev) => {
  const msg = ev.data
  if (!msg || msg.type !== 'process') return
  const { buffer, width, height, id } = msg
  const cv = self.cv
  if (!ready || !cv || !cv.Mat) {
    postMessage({ type: 'result', id, found: false })
    return
  }

  let src, work
  try {
    const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height)
    src = cv.matFromImageData(imageData)

    // Detecta em escala reduzida (rápido)
    const detW = 1000
    const scale = Math.min(1, detW / width)
    work = src
    if (scale < 1) {
      work = new cv.Mat()
      cv.resize(src, work, new cv.Size(Math.round(width * scale), Math.round(height * scale)))
    }

    const corners = findCorners(cv, work)
    let result = null
    if (corners) {
      const inv = scale < 1 ? 1 / scale : 1
      const full = {
        tl: { x: corners.tl.x * inv, y: corners.tl.y * inv },
        tr: { x: corners.tr.x * inv, y: corners.tr.y * inv },
        bl: { x: corners.bl.x * inv, y: corners.bl.y * inv },
        br: { x: corners.br.x * inv, y: corners.br.y * inv },
      }
      result = warp(cv, src, full)
    }

    if (work !== src) work.delete()
    src.delete()

    if (result) {
      postMessage(
        { type: 'result', id, found: true, buffer: result.data.buffer, width: result.width, height: result.height },
        [result.data.buffer],
      )
    } else {
      postMessage({ type: 'result', id, found: false })
    }
  } catch (e) {
    try {
      if (work && work !== src) work.delete()
      if (src) src.delete()
    } catch (_) {}
    postMessage({ type: 'result', id, found: false, error: String(e) })
  }
}

function findCorners(cv, src) {
  const gray = new cv.Mat()
  const edges = new cv.Mat()
  const blur = new cv.Mat()
  const thresh = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let corners = null
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.Canny(gray, edges, 50, 200)
    cv.GaussianBlur(edges, blur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT)
    cv.threshold(blur, thresh, 0, 255, cv.THRESH_OTSU)
    cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE)

    let maxArea = 0
    let idx = -1
    for (let i = 0; i < contours.size(); i++) {
      const a = cv.contourArea(contours.get(i))
      if (a > maxArea) {
        maxArea = a
        idx = i
      }
    }
    if (idx >= 0) {
      const c = cornerPoints(cv, contours.get(idx))
      if (c && polyArea(c) > 0.1 * src.cols * src.rows) corners = c
    }
  } finally {
    gray.delete()
    edges.delete()
    blur.delete()
    thresh.delete()
    contours.delete()
    hierarchy.delete()
  }
  return corners
}

function cornerPoints(cv, contour) {
  const rect = cv.minAreaRect(contour)
  const center = rect.center
  let tl, tr, bl, br
  let tlD = 0,
    trD = 0,
    blD = 0,
    brD = 0
  const data = contour.data32S
  for (let i = 0; i < data.length; i += 2) {
    const p = { x: data[i], y: data[i + 1] }
    const d = Math.hypot(p.x - center.x, p.y - center.y)
    if (p.x < center.x && p.y < center.y) {
      if (d > tlD) { tl = p; tlD = d }
    } else if (p.x > center.x && p.y < center.y) {
      if (d > trD) { tr = p; trD = d }
    } else if (p.x < center.x && p.y > center.y) {
      if (d > blD) { bl = p; blD = d }
    } else if (p.x > center.x && p.y > center.y) {
      if (d > brD) { br = p; brD = d }
    }
  }
  if (tl && tr && bl && br) return { tl, tr, bl, br }
  return null
}

function warp(cv, src, c) {
  const w = Math.max(120, Math.round((dist(c.tl, c.tr) + dist(c.bl, c.br)) / 2))
  const h = Math.max(120, Math.round((dist(c.tl, c.bl) + dist(c.tr, c.br)) / 2))
  const dst = new cv.Mat()
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    c.tl.x, c.tl.y, c.tr.x, c.tr.y, c.bl.x, c.bl.y, c.br.x, c.br.y,
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, 0, h, w, h])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar())
  const data = new Uint8ClampedArray(dst.data) // cópia (RGBA)
  dst.delete()
  srcTri.delete()
  dstTri.delete()
  M.delete()
  return { data, width: w, height: h }
}

function polyArea(c) {
  const p = [c.tl, c.tr, c.br, c.bl]
  let a = 0
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    a += p[i].x * p[j].y - p[j].x * p[i].y
  }
  return Math.abs(a / 2)
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
