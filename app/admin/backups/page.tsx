'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type ExecucaoBackup = {
  id: number
  tipo: 'MANUAL' | 'AUTOMATICO'
  status: 'CONCLUIDO' | 'FALHA'
  integridade: 'VALIDA' | 'INVALIDA' | 'NAO_VERIFICADA'
  arquivo_nome?: string | null
  tamanho_bytes: number
  checksum_sha256?: string | null
  total_tabelas: number
  total_registros: number
  tabelas_ignoradas: number
  gerado_por_nome?: string | null
  gerado_por_email?: string | null
  erro?: string | null
  criado_em: string
}

type ResumoBackup = {
  situacao: 'SEM_BACKUP' | 'EM_DIA' | 'ATRASADO'
  ultimoBackup?: string | null
  prazoDias: number
  totalExecucoes?: number
  ultimaExecucao?: string | null
}

export default function BackupsPage() {
  const [execucoes, setExecucoes] = useState<ExecucaoBackup[]>([])
  const [resumo, setResumo] = useState<ResumoBackup>({ situacao: 'SEM_BACKUP', prazoDias: 7 })
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/backup?acao=historico', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar histórico de backups.')
      setExecucoes((data?.execucoes ?? []) as ExecucaoBackup[])
      setResumo((data?.resumo ?? { situacao: 'SEM_BACKUP', prazoDias: 7 }) as ResumoBackup)
      setEstruturaPendente(Boolean(data?.estruturaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar histórico de backups.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(carregar)
  }, [carregar])

  async function gerarBackup() {
    setGerando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/backup', { cache: 'no-store' })
      const blob = await response.blob()
      if (!response.ok) {
        const texto = await blob.text()
        const data = tentarJson(texto)
        throw new Error(data?.error ?? 'Erro ao gerar backup.')
      }

      const nome = extrairNomeArquivo(response.headers.get('content-disposition')) ?? `backup-chame-o-tecnico-${Date.now()}.json`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nome
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMensagem('Backup verificado e baixado. Guarde o arquivo em dois locais seguros.')
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao gerar backup.')
    } finally {
      setGerando(false)
    }
  }

  const ultimo = useMemo(() => execucoes.find((item) => item.status === 'CONCLUIDO' && item.integridade === 'VALIDA') ?? null, [execucoes])
  const situacaoVisual = visualSituacao(resumo.situacao)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Acesso master</p>
          <h1 className="text-3xl font-black text-slate-950">Central de Backups</h1>
          <p className="mt-1 text-sm text-slate-600">Proteção dos dados, histórico das cópias e verificação de integridade.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void carregar()} disabled={carregando} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">Atualizar</button>
          <button type="button" onClick={() => void gerarBackup()} disabled={gerando || estruturaPendente} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">{gerando ? 'Gerando e verificando...' : 'Gerar backup agora'}</button>
        </div>
      </header>

      {estruturaPendente && <Aviso classe="border-amber-200 bg-amber-50 text-amber-900">Execute o arquivo <b>supabase-add-central-backups.sql</b> no Supabase para ativar o histórico.</Aviso>}
      {erro && <Aviso classe="border-red-200 bg-red-50 text-red-700">{erro}</Aviso>}
      {mensagem && <Aviso classe="border-emerald-200 bg-emerald-50 text-emerald-700">{mensagem}</Aviso>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Situação" valor={situacaoVisual.rotulo} classe={situacaoVisual.classe} />
        <Card label="Último backup válido" valor={resumo.ultimoBackup ? dataHora(resumo.ultimoBackup) : 'Ainda não realizado'} />
        <Card label="Registros na última cópia" valor={ultimo ? Number(ultimo.total_registros).toLocaleString('pt-BR') : '—'} />
        <Card label="Tamanho da última cópia" valor={ultimo ? formatarBytes(Number(ultimo.tamanho_bytes)) : '—'} />
      </section>

      {resumo.situacao !== 'EM_DIA' && !estruturaPendente && (
        <Aviso classe="border-red-200 bg-red-50 text-red-800">
          {resumo.situacao === 'SEM_BACKUP'
            ? 'Ainda não existe um backup válido registrado. Gere a primeira cópia agora.'
            : `O último backup ultrapassou o prazo de ${resumo.prazoDias} dias. Gere uma nova cópia.`}
        </Aviso>
      )}

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black text-slate-950">Histórico de backups</h2>
            <p className="text-sm text-slate-500">As últimas 50 tentativas de geração.</p>
          </div>
          {carregando ? (
            <p className="p-8 text-center text-sm text-slate-500">Carregando histórico...</p>
          ) : execucoes.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Nenhum backup registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Conteúdo</th><th className="px-4 py-3">Tamanho</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Comprovante</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {execucoes.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-4 font-bold text-slate-900">{dataHora(item.criado_em)}<p className="mt-1 text-xs font-normal text-slate-500">{item.tipo === 'MANUAL' ? 'Manual' : 'Automático'}</p></td>
                      <td className="px-4 py-4"><Status item={item} />{item.erro && <p className="mt-2 max-w-xs text-xs text-red-700">{item.erro}</p>}</td>
                      <td className="px-4 py-4 text-slate-700">{Number(item.total_registros).toLocaleString('pt-BR')} registros<p className="mt-1 text-xs text-slate-500">{item.total_tabelas} tabelas{item.tabelas_ignoradas > 0 ? ` · ${item.tabelas_ignoradas} ignorada(s)` : ''}</p></td>
                      <td className="px-4 py-4 font-bold text-slate-700">{formatarBytes(Number(item.tamanho_bytes))}</td>
                      <td className="px-4 py-4 text-slate-700">{item.gerado_por_nome || item.gerado_por_email || 'Sistema'}<p className="mt-1 text-xs text-slate-500">{item.gerado_por_email}</p></td>
                      <td className="px-4 py-4"><p className="max-w-[180px] truncate font-mono text-xs text-slate-600" title={item.checksum_sha256 ?? ''}>{item.checksum_sha256 ? `SHA-256 ${item.checksum_sha256}` : '—'}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="font-black text-blue-950">Integridade verificada</h2>
            <p className="mt-2 text-sm leading-6 text-blue-900">Cada arquivo recebe um código SHA-256 único. Esse comprovante permite identificar qualquer alteração ou corrupção posterior.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-950">Escopo desta etapa</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">O arquivo contém os dados do banco e as referências de fotos e documentos. Os arquivos físicos armazenados no Storage serão protegidos na etapa de backup automático em nuvem.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-black text-slate-950">Regra recomendada</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Mantenha uma cópia no computador e outra fora dele, como Google Drive ou pendrive guardado separadamente.</p>
            <p className="mt-3 text-xs font-black uppercase text-slate-500">Alerta após {resumo.prazoDias} dias sem cópia válida</p>
          </div>
        </aside>
      </section>
    </div>
  )
}

function Card({ label, valor, classe = 'border-slate-200 bg-white text-slate-950' }: { label: string; valor: string; classe?: string }) {
  return <div className={`rounded-2xl border p-4 shadow-sm ${classe}`}><p className="text-xs font-black uppercase tracking-wide">{label}</p><p className="mt-2 text-xl font-black">{valor}</p></div>
}

function Aviso({ classe, children }: { classe: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border p-4 text-sm font-bold ${classe}`}>{children}</div>
}

function Status({ item }: { item: ExecucaoBackup }) {
  if (item.status === 'FALHA') return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-800">Falha</span>
  if (item.integridade === 'VALIDA') return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">Íntegro</span>
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">Não verificado</span>
}

function visualSituacao(situacao: ResumoBackup['situacao']) {
  if (situacao === 'EM_DIA') return { rotulo: 'Protegido', classe: 'border-emerald-200 bg-emerald-50 text-emerald-900' }
  if (situacao === 'ATRASADO') return { rotulo: 'Backup atrasado', classe: 'border-red-200 bg-red-50 text-red-900' }
  return { rotulo: 'Sem backup', classe: 'border-amber-200 bg-amber-50 text-amber-900' }
}

function dataHora(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function formatarBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function extrairNomeArquivo(disposition: string | null) {
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? null
}

function tentarJson(texto: string) {
  try {
    return JSON.parse(texto) as { error?: string }
  } catch {
    return null
  }
}
