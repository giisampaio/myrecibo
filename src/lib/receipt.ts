/** Valor por extenso em reais (simplificado, suficiente para recibos). */
export function valorPorExtenso(value: number): string {
  const reais = Math.floor(value)
  const centavos = Math.round((value - reais) * 100)
  let out = `${extenso(reais)} ${reais === 1 ? 'real' : 'reais'}`
  if (centavos > 0) out += ` e ${extenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`
  return out
}

function extenso(n: number): string {
  if (n === 0) return 'zero'
  if (n === 100) return 'cem'
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const d10 = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

  const parts: string[] = []
  if (n >= 1000) {
    const milhar = Math.floor(n / 1000)
    parts.push(milhar === 1 ? 'mil' : `${extenso(milhar)} mil`)
    n %= 1000
    if (n === 0) return parts.join(' ')
  }
  if (n >= 100) {
    parts.push(c[Math.floor(n / 100)])
    n %= 100
  }
  if (n >= 20) {
    const dez = d[Math.floor(n / 10)]
    n %= 10
    parts.push(n > 0 ? `${dez} e ${u[n]}` : dez)
  } else if (n >= 10) {
    parts.push(d10[n - 10])
  } else if (n > 0) {
    parts.push(u[n])
  }
  return parts.filter(Boolean).join(' e ')
}
