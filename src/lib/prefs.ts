// Preferências locais do aparelho (localStorage).

const NATIVE_CAMERA_KEY = 'myrecibo.nativeCamera'
const CAMERA_HINT_KEY = 'myrecibo.cameraHintDismissed'

/** Câmera nativa do iPhone (sem aviso de permissão) no lugar do scanner ao vivo. */
export function getNativeCamera(): boolean {
  return localStorage.getItem(NATIVE_CAMERA_KEY) === '1'
}
export function setNativeCamera(v: boolean): void {
  localStorage.setItem(NATIVE_CAMERA_KEY, v ? '1' : '0')
}

/** Dica única sobre como cravar a permissão da câmera nos Ajustes do iOS. */
export function isCameraHintDismissed(): boolean {
  return localStorage.getItem(CAMERA_HINT_KEY) === '1'
}
export function dismissCameraHint(): void {
  localStorage.setItem(CAMERA_HINT_KEY, '1')
}
