/*
 * Háptico como *progressive enhancement*.
 * - Android/desktop: Vibration API.
 * - iOS Safari: não há Vibration API; tentamos o truque do <input switch>
 *   (iOS 17.4–26.x; bloqueado em 26.5). Se nada existir, é no-op silencioso.
 * Nunca é requisito — o feedback principal é visual/animação.
 */

type Kind = 'light' | 'success'

let toggle: HTMLInputElement | null = null

function ensureToggle(): HTMLInputElement | null {
  if (toggle) return toggle
  if (typeof document === 'undefined') return null
  try {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.setAttribute('switch', '') // atributo não-padrão do Safari
    el.style.position = 'fixed'
    el.style.opacity = '0'
    el.style.width = '0'
    el.style.height = '0'
    el.style.pointerEvents = 'none'
    el.setAttribute('aria-hidden', 'true')
    el.tabIndex = -1
    document.body.appendChild(el)
    toggle = el
  } catch {
    toggle = null
  }
  return toggle
}

export function haptic(kind: Kind = 'light'): void {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav && typeof nav.vibrate === 'function') {
      nav.vibrate(kind === 'success' ? [12, 40, 12] : 6)
    }
    const sw = ensureToggle()
    if (sw) sw.click() // dispara o motor háptico no Safari quando suportado
  } catch {
    /* no-op */
  }
}
