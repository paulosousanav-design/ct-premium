'use client'

export const UNIDADE_STORAGE_KEY = 'ct-admin-unidade-id'

export function getUnidadeSelecionadaId() {
  if (typeof window === 'undefined') return null
  const id = Number(window.localStorage.getItem(UNIDADE_STORAGE_KEY))
  return Number.isFinite(id) && id > 0 ? id : null
}

export function setUnidadeSelecionadaId(id: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UNIDADE_STORAGE_KEY, String(id))
}
