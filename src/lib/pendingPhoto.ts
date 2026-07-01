// Guarda temporariamente a foto recém-capturada no scanner para a tela de
// Nova despesa consumir (Blob não cabe bem no state do histórico do router).
// A foto NÃO é consumida na leitura: se o usuário sair do wizard sem salvar,
// voltar a /nova retoma a mesma foto. Só some ao salvar/trocar.

let pending: Blob | undefined

export function setPendingPhoto(blob: Blob) {
  pending = blob
}

export function peekPendingPhoto(): Blob | undefined {
  return pending
}

export function clearPendingPhoto() {
  pending = undefined
}
