declare module 'jscanify/client' {
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
  export default class jscanify {
    constructor()
    findPaperContour(img: any): any | null
    getCornerPoints(contour: any): CornerPoints
    highlightPaper(image: HTMLCanvasElement | HTMLImageElement, options?: { color?: string; thickness?: number }): HTMLCanvasElement
    extractPaper(
      image: HTMLCanvasElement | HTMLImageElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: Required<CornerPoints>,
    ): HTMLCanvasElement | null
  }
}
