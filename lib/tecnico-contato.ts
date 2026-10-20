export function linkWhatsApp(valor?: string | null) {
  const numeros = String(valor ?? '').replace(/\D/g, '')
  const internacional = numeros.startsWith('55') && (numeros.length === 12 || numeros.length === 13)
    ? numeros
    : numeros.length === 10 || numeros.length === 11
      ? `55${numeros}`
      : ''
  return internacional ? `https://wa.me/${internacional}` : ''
}

export function linkMapa(endereco?: string | null) {
  const texto = String(endereco ?? '').trim()
  if (!texto || texto === '-') return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`
}
