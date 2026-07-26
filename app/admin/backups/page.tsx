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
  destino?: string | null
  google_link?: string | null
  arquivos_storage_enviados?: number | null
  criado_em: string
}

type ResumoBackup = {
  situacao: 'SEM_BACKUP' | 'EM_DIA' | 'ATRASADO'
  ultimoBackup?: string | null
  prazoDias: number
  totalExecucoes?: number
  ultimaExecucao?: string | null
}

type GoogleConfig = {
  estruturaPendente: boolean
  ambienteConfigurado: boolean
  cronConfigurado: boolean
  redirectUri?: string
  conectado: boolean
  configuracao?: {
    google_email?: string | null
    google_conectado_em?: string | null
    automatico_ativo?: boolean
    retencao_dias?: number
    ultimo_backup_automatico_em?: string | null
    ultimo_backup_automatico_status?: string | null
    ultimo_backup_automatico_erro?: string | null
  } | null
}

export default function BackupsPage() {
  const [execucoes, setExecucoes] = useState<ExecucaoBackup[]>([])
  const [resumo, setResumo] = useState<ResumoBackup>({ situacao: 'SEM_BACKUP', prazoDias: 7 })
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [google, setGoogle] = useState<GoogleConfig | null>(null)
  const [processandoGoogle, setProcessandoGoogle] = useState(false)
  const [retencaoDias, setRetencaoDias] = useState(30)

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

  const carregarGoogle = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/backup/google', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao verificar Google Drive.')
      setGoogle(data as GoogleConfig)
      setRetencaoDias(Number(data?.configuracao?.retencao_dias ?? 30))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao verificar Google Drive.')
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(carregar)
    void Promise.resolve().then(carregarGoogle)
    const params = new URLSearchParams(window.location.search)
    void Promise.resolve().then(() => {
      if (params.get('google') === 'conectado') setMensagem('Google Drive conectado. Ative a rotina automática após executar o teste.')
      if (params.get('googleErro')) setErro(params.get('googleErro') ?? 'Erro ao conectar Google Drive.')
    })
  }, [carregar, carregarGoogle])

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

  async function conectarGoogle() {
    setProcessandoGoogle(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/backup/google?acao=autorizar', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.url) throw new Error(data?.error ?? 'Erro ao iniciar autorização do Google.')
      window.location.href = String(data.url)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao conectar Google Drive.')
      setProcessandoGoogle(false)
    }
  }

  async function testarGoogle() {
    setProcessandoGoogle(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/backup/google', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro no teste do Google Drive.')
      setMensagem(`Backup enviado ao Google Drive.${data?.resultado?.storageEnviados ? ` ${data.resultado.storageEnviados} arquivo(s) do Storage copiado(s).` : ''}`)
      await Promise.all([carregar(), carregarGoogle()])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro no teste do Google Drive.')
    } finally {
      setProcessandoGoogle(false)
    }
  }

  async function salvarGoogle(automaticoAtivo: boolean) {
    setProcessandoGoogle(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/backup/google', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automaticoAtivo, retencaoDias }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao salvar automação.')
      setMensagem(automaticoAtivo ? 'Backup automático diário ativado.' : 'Backup automático pausado.')
      await carregarGoogle()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar automação.')
    } finally {
      setProcessandoGoogle(false)
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-blue-600">Cópia externa</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Google Drive automático</h2>
            <p className="mt-1 text-sm text-slate-600">Banco diário às 04h de Cuiabá, retenção configurável e cópia incremental de fotos e documentos.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${google?.conectado ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            {google?.conectado ? `Conectado · ${google.configuracao?.google_email ?? 'Google'}` : 'Não conectado'}
          </span>
        </div>

        {google?.estruturaPendente ? (
          <Aviso classe="mt-4 border-amber-200 bg-amber-50 text-amber-900">Execute <b>supabase-add-backup-google-drive.sql</b> no Supabase.</Aviso>
        ) : !google?.ambienteConfigurado ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-black">Configuração da hospedagem pendente</p>
            <p className="mt-2">Cadastre no ambiente de produção: <b>GOOGLE_DRIVE_CLIENT_ID</b>, <b>GOOGLE_DRIVE_CLIENT_SECRET</b> e <b>CRON_SECRET</b>.</p>
            {google?.redirectUri && <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs">Redirect URI: {google.redirectUri}</p>}
          </div>
        ) : google?.conectado ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px_220px] lg:items-end">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <p><b>Última rotina:</b> {google.configuracao?.ultimo_backup_automatico_em ? dataHora(google.configuracao.ultimo_backup_automatico_em) : 'Ainda não executada'}</p>
              <p className="mt-1"><b>Status:</b> {google.configuracao?.ultimo_backup_automatico_status || 'Aguardando teste'}</p>
              {google.configuracao?.ultimo_backup_automatico_erro && <p className="mt-2 text-red-700">{google.configuracao.ultimo_backup_automatico_erro}</p>}
            </div>
            <CampoGoogle label="Retenção do banco">
              <select value={retencaoDias} onChange={(event) => setRetencaoDias(Number(event.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold">
                <option value={15}>15 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option>
              </select>
            </CampoGoogle>
            <button type="button" onClick={() => void testarGoogle()} disabled={processandoGoogle} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 disabled:opacity-50">{processandoGoogle ? 'Processando...' : 'Testar envio agora'}</button>
            <div className="flex flex-wrap gap-2 lg:col-span-3">
              <button type="button" onClick={() => void salvarGoogle(!google.configuracao?.automatico_ativo)} disabled={processandoGoogle} className={`rounded-xl px-4 py-3 text-sm font-black text-white ${google.configuracao?.automatico_ativo ? 'bg-amber-600' : 'bg-emerald-600'}`}>{google.configuracao?.automatico_ativo ? 'Pausar automação' : 'Ativar backup diário'}</button>
              <button type="button" onClick={() => void salvarGoogle(Boolean(google.configuracao?.automatico_ativo))} disabled={processandoGoogle} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Salvar retenção</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => void conectarGoogle()} disabled={processandoGoogle || !google} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">{processandoGoogle ? 'Abrindo Google...' : 'Conectar meu Google Drive'}</button>
        )}
      </section>

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
                      <td className="px-4 py-4 text-slate-700">{Number(item.total_registros).toLocaleString('pt-BR')} registros<p className="mt-1 text-xs text-slate-500">{item.total_tabelas} tabelas{item.tabelas_ignoradas > 0 ? ` · ${item.tabelas_ignoradas} ignorada(s)` : ''}{Number(item.arquivos_storage_enviados) > 0 ? ` · ${item.arquivos_storage_enviados} arquivo(s)` : ''}</p></td>
                      <td className="px-4 py-4 font-bold text-slate-700">{formatarBytes(Number(item.tamanho_bytes))}</td>
                      <td className="px-4 py-4 text-slate-700">{item.gerado_por_nome || item.gerado_por_email || 'Sistema'}<p className="mt-1 text-xs text-slate-500">{item.gerado_por_email}</p></td>
                      <td className="px-4 py-4"><p className="max-w-[180px] truncate font-mono text-xs text-slate-600" title={item.checksum_sha256 ?? ''}>{item.checksum_sha256 ? `SHA-256 ${item.checksum_sha256}` : '—'}</p>{item.google_link && <a href={item.google_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-black text-blue-700">Abrir no Drive</a>}</td>
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

function CampoGoogle({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>{children}</label>
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
