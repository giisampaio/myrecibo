import { PDFDocument } from 'pdf-lib'

/** Rasteriza um nó (modelo de recibo) em PNG de alta resolução. */
export async function nodeToImage(node: HTMLElement, scale = 2.5): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas-pro')
  const canvas = await html2canvas(node, {
    scale,
    backgroundColor: '#ffffff',
    logging: false,
  })
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png'),
  )
}

/** Embute a imagem do recibo numa página A4 (para baixar em PDF). */
export async function imageToPdf(blob: Blob): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const img = await pdf.embedPng(bytes)

  const pageW = 595
  const pageH = 842
  const margin = 28
  const fit = Math.min((pageW - margin * 2) / img.width, (pageH - margin * 2) / img.height)
  const w = img.width * fit
  const h = img.height * fit
  const page = pdf.addPage([pageW, pageH])
  page.drawImage(img, { x: (pageW - w) / 2, y: pageH - margin - h, width: w, height: h })
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
}
