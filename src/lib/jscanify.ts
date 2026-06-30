/*
 * Versão de navegador do jscanify (MIT, ColonelParrot) adaptada para ESM.
 * Embutida no projeto para evitar a dependência npm, que arrasta `canvas`
 * (módulo nativo do Node, só usado no entry de servidor — não precisamos dele).
 * Usa o OpenCV.js global (`cv`), carregado sob demanda em ./opencv.ts.
 */

declare const cv: any

export interface Corner {
  x: number
  y: number
}

export interface CornerPoints {
  topLeftCorner?: Corner
  topRightCorner?: Corner
  bottomLeftCorner?: Corner
  bottomRightCorner?: Corner
}

function distance(p1: Corner, p2: Corner): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

export default class JScanify {
  /** Encontra o maior contorno (o "papel") dentro da imagem (cv.Mat). */
  findPaperContour(img: any): any | null {
    const imgGray = new cv.Mat()
    cv.Canny(img, imgGray, 50, 200)

    const imgBlur = new cv.Mat()
    cv.GaussianBlur(imgGray, imgBlur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT)

    const imgThresh = new cv.Mat()
    cv.threshold(imgBlur, imgThresh, 0, 255, cv.THRESH_OTSU)

    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    cv.findContours(imgThresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE)

    let maxArea = 0
    let maxContourIndex = -1
    for (let i = 0; i < contours.size(); ++i) {
      const area = cv.contourArea(contours.get(i))
      if (area > maxArea) {
        maxArea = area
        maxContourIndex = i
      }
    }

    const maxContour = maxContourIndex >= 0 ? contours.get(maxContourIndex) : null

    imgGray.delete()
    imgBlur.delete()
    imgThresh.delete()
    contours.delete()
    hierarchy.delete()
    return maxContour
  }

  /** Recorta e corrige a perspectiva do documento detectado. */
  extractPaper(
    image: HTMLCanvasElement | HTMLImageElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints?: Required<CornerPoints>,
  ): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas')
    const img = cv.imread(image)
    const maxContour = cornerPoints ? null : this.findPaperContour(img)

    if (maxContour == null && cornerPoints === undefined) {
      img.delete()
      return null
    }

    const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } =
      cornerPoints || this.getCornerPoints(maxContour)

    if (!topLeftCorner || !topRightCorner || !bottomLeftCorner || !bottomRightCorner) {
      img.delete()
      return null
    }

    const warpedDst = new cv.Mat()
    const dsize = new cv.Size(resultWidth, resultHeight)
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      topLeftCorner.x,
      topLeftCorner.y,
      topRightCorner.x,
      topRightCorner.y,
      bottomLeftCorner.x,
      bottomLeftCorner.y,
      bottomRightCorner.x,
      bottomRightCorner.y,
    ])
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      resultWidth,
      0,
      0,
      resultHeight,
      resultWidth,
      resultHeight,
    ])

    const M = cv.getPerspectiveTransform(srcTri, dstTri)
    cv.warpPerspective(img, warpedDst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar())
    cv.imshow(canvas, warpedDst)

    img.delete()
    warpedDst.delete()
    srcTri.delete()
    dstTri.delete()
    M.delete()
    return canvas
  }

  /** Calcula os 4 cantos do contorno. */
  getCornerPoints(contour: any): CornerPoints {
    const rect = cv.minAreaRect(contour)
    const center = rect.center

    let topLeftCorner: Corner | undefined
    let topLeftCornerDist = 0
    let topRightCorner: Corner | undefined
    let topRightCornerDist = 0
    let bottomLeftCorner: Corner | undefined
    let bottomLeftCornerDist = 0
    let bottomRightCorner: Corner | undefined
    let bottomRightCornerDist = 0

    for (let i = 0; i < contour.data32S.length; i += 2) {
      const point = { x: contour.data32S[i], y: contour.data32S[i + 1] }
      const dist = distance(point, center)
      if (point.x < center.x && point.y < center.y) {
        if (dist > topLeftCornerDist) {
          topLeftCorner = point
          topLeftCornerDist = dist
        }
      } else if (point.x > center.x && point.y < center.y) {
        if (dist > topRightCornerDist) {
          topRightCorner = point
          topRightCornerDist = dist
        }
      } else if (point.x < center.x && point.y > center.y) {
        if (dist > bottomLeftCornerDist) {
          bottomLeftCorner = point
          bottomLeftCornerDist = dist
        }
      } else if (point.x > center.x && point.y > center.y) {
        if (dist > bottomRightCornerDist) {
          bottomRightCorner = point
          bottomRightCornerDist = dist
        }
      }
    }

    return { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner }
  }
}
