export const PRAZO_BACKUP_DIAS = 7

export type SituacaoBackup = 'SEM_BACKUP' | 'EM_DIA' | 'ATRASADO'

export function situacaoBackup(ultimoBackup: string | null | undefined, agora = Date.now()): SituacaoBackup {
  if (!ultimoBackup) return 'SEM_BACKUP'
  const data = new Date(ultimoBackup).getTime()
  if (!Number.isFinite(data)) return 'SEM_BACKUP'
  const prazoMs = PRAZO_BACKUP_DIAS * 24 * 60 * 60 * 1000
  return agora - data > prazoMs ? 'ATRASADO' : 'EM_DIA'
}
