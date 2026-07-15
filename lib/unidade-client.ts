'use client'

export const UNIDADE_STORAGE_KEY = 'ct-admin-unidade-id'
export const ESCOPO_GERENCIAL_STORAGE_KEY = 'ct-admin-escopo-gerencial'
export const UNIDADES_PERMITIDAS_STORAGE_KEY = 'ct-admin-unidades-permitidas'
export const ESCOPO_CONSOLIDADO = 'CONSOLIDADO'
const ESCOPO_SYNC_VERSION_KEY = 'ct-admin-escopo-sync-version'

export function getUnidadeSelecionadaId() {
  if (typeof window === 'undefined') return null
  const id = Number(window.localStorage.getItem(UNIDADE_STORAGE_KEY))
  return Number.isFinite(id) && id > 0 ? id : null
}

export function setUnidadeSelecionadaId(id: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UNIDADE_STORAGE_KEY, String(id))
}

export function getEscopoGerencial() {
  if (typeof window === 'undefined') return ESCOPO_CONSOLIDADO
  return window.localStorage.getItem(ESCOPO_GERENCIAL_STORAGE_KEY)
    || String(getUnidadeSelecionadaId() ?? ESCOPO_CONSOLIDADO)
}

export function setEscopoGerencial(value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ESCOPO_GERENCIAL_STORAGE_KEY, value)
  const unidadeId = Number(value)
  if (Number.isFinite(unidadeId) && unidadeId > 0) setUnidadeSelecionadaId(unidadeId)
}

export function sincronizarEscopoGerencialPadrao(unidadeId: number | null) {
  if (typeof window === 'undefined') return ESCOPO_CONSOLIDADO
  if (window.localStorage.getItem(ESCOPO_SYNC_VERSION_KEY) !== '2') {
    const escopo = unidadeId ? String(unidadeId) : ESCOPO_CONSOLIDADO
    setEscopoGerencial(escopo)
    window.localStorage.setItem(ESCOPO_SYNC_VERSION_KEY, '2')
    return escopo
  }
  return getEscopoGerencial()
}

export function paginaUsaEscopoGerencial(pathname?: string) {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  return ['/admin/dashboard', '/admin/financeiro', '/admin/relatorios'].some(
    (base) => path === base || path.startsWith(`${base}/`)
  )
}

export function getEscopoCabecalho() {
  if (paginaUsaEscopoGerencial()) return getEscopoGerencial()
  const unidadeId = getUnidadeSelecionadaId()
  return unidadeId ? String(unidadeId) : ''
}

export function getUnidadeGerencialId() {
  const escopo = getEscopoGerencial()
  const id = Number(escopo)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function setUnidadesPermitidasIds(ids: number[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UNIDADES_PERMITIDAS_STORAGE_KEY, JSON.stringify(ids))
}

export function getUnidadesPermitidasIds() {
  if (typeof window === 'undefined') return []
  try {
    const ids = JSON.parse(window.localStorage.getItem(UNIDADES_PERMITIDAS_STORAGE_KEY) || '[]')
    return Array.isArray(ids) ? ids.map(Number).filter((id) => Number.isFinite(id) && id > 0) : []
  } catch {
    return []
  }
}
