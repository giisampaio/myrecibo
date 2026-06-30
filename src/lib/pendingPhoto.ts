// Guarda temporariamente a foto recém-capturada no scanner para a tela de
// Nova despesa consumir (Blob não cabe bem no state do histórico do router).

let pending: Blob | undefined

export function setPendingPhoto(blob: Blob) {
  pending = blob
}

export function takePendingPhoto(): Blob | undefined {
  const b = pending
  pending = undefined
  return b
}
