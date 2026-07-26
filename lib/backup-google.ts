import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarBackupDados } from '@/lib/backup-dados'
import {
  descriptografarSegredo,
  enviarArquivoDrive,
  removerBackupsAntigos,
  renovarAccessToken,
} from '@/lib/google-drive'

const BUCKETS_BACKUP = [
  'os-fotos',
  'tecnico-documentos',
  'tecnico-crachas',
  'academia-materiais',
  'documento-carimbos',
]
const LIMITE_STORAGE_POR_EXECUCAO = 30

type ConfiguracaoGoogle = {
  google_refresh_token_criptografado?: string | null
  google_pasta_banco_id?: string | null
  google_pasta_storage_id?: string | null
  automatico_ativo?: boolean | null
  retencao_dias?: number | null
}

export async function executarBackupGoogle(
  supabase: SupabaseClient,
  input: { tipo: 'MANUAL' | 'AUTOMATICO'; responsavelNome: string; responsavelEmail: string }
) {
  const { data: config, error: configError } = await supabase
    .from('backup_configuracoes')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (configError) throw configError
  const configuracao = config as ConfiguracaoGoogle | null
  if (!configuracao?.google_refresh_token_criptografado || !configuracao.google_pasta_banco_id || !configuracao.google_pasta_storage_id) {
    throw new Error('Google Drive ainda nao conectado na Central de Backups.')
  }
  if (input.tipo === 'AUTOMATICO' && !configuracao.automatico_ativo) {
    return { ignorado: true, motivo: 'Backup automatico desativado.' }
  }

  try {
    const refreshToken = descriptografarSegredo(configuracao.google_refresh_token_criptografado)
    const accessToken = await renovarAccessToken(refreshToken)
    const backup = await gerarBackupDados(supabase, {
      tipo: input.tipo === 'AUTOMATICO' ? 'backup_automatico' : 'backup_manual',
      geradoPor: input.responsavelEmail,
    })
    const checksum = createHash('sha256').update(backup.conteudo).digest('hex')
    const arquivo = await enviarArquivoDrive({
      accessToken,
      nome: backup.nomeArquivo,
      parentId: configuracao.google_pasta_banco_id,
      conteudo: backup.conteudo,
      contentType: 'application/json; charset=utf-8',
      descricao: `Backup ${input.tipo.toLowerCase()} do banco. SHA-256: ${checksum}`,
    })
    const storageEnviados = await copiarStorageIncremental(
      supabase,
      accessToken,
      configuracao.google_pasta_storage_id
    )
    await removerBackupsAntigos(accessToken, configuracao.google_pasta_banco_id, Number(configuracao.retencao_dias ?? 30))

    const tamanhoBytes = Buffer.byteLength(backup.conteudo, 'utf8')
    const { error: historicoError } = await supabase.from('backup_execucoes').insert({
      tipo: input.tipo,
      status: 'CONCLUIDO',
      integridade: 'VALIDA',
      destino: 'GOOGLE_DRIVE',
      arquivo_nome: backup.nomeArquivo,
      tamanho_bytes: tamanhoBytes,
      checksum_sha256: checksum,
      total_tabelas: backup.totalTabelas,
      total_registros: backup.totalRegistros,
      tabelas_ignoradas: backup.tabelasIgnoradas,
      arquivos_storage_enviados: storageEnviados,
      google_arquivo_id: arquivo.id,
      google_link: arquivo.webViewLink ?? null,
      gerado_por_nome: input.responsavelNome,
      gerado_por_email: input.responsavelEmail,
    })
    if (historicoError) throw historicoError

    await supabase.from('backup_configuracoes').update({
      ultimo_backup_automatico_em: new Date().toISOString(),
      ultimo_backup_automatico_status: 'CONCLUIDO',
      ultimo_backup_automatico_erro: null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', 1)

    return {
      ignorado: false,
      arquivo: backup.nomeArquivo,
      googleLink: arquivo.webViewLink ?? null,
      storageEnviados,
      totalRegistros: backup.totalRegistros,
    }
  } catch (error) {
    const mensagem = erroTexto(error)
    await supabase.from('backup_configuracoes').update({
      ultimo_backup_automatico_em: new Date().toISOString(),
      ultimo_backup_automatico_status: 'FALHA',
      ultimo_backup_automatico_erro: mensagem.slice(0, 2000),
      atualizado_em: new Date().toISOString(),
    }).eq('id', 1)
    await supabase.from('backup_execucoes').insert({
      tipo: input.tipo,
      status: 'FALHA',
      integridade: 'INVALIDA',
      destino: 'GOOGLE_DRIVE',
      gerado_por_nome: input.responsavelNome,
      gerado_por_email: input.responsavelEmail,
      erro: mensagem.slice(0, 2000),
    })
    throw error
  }
}

async function copiarStorageIncremental(supabase: SupabaseClient, accessToken: string, pastaDriveId: string) {
  let enviados = 0
  for (const bucket of BUCKETS_BACKUP) {
    if (enviados >= LIMITE_STORAGE_POR_EXECUCAO) break
    const arquivos = await listarArquivosBucket(supabase, bucket)
    if (arquivos === null) continue
    const { data: registrados } = await supabase
      .from('backup_storage_arquivos')
      .select('caminho')
      .eq('bucket', bucket)
    const existentes = new Set((registrados ?? []).map((item) => String(item.caminho)))

    for (const arquivo of arquivos) {
      if (enviados >= LIMITE_STORAGE_POR_EXECUCAO) break
      if (existentes.has(arquivo.caminho)) continue
      const { data, error } = await supabase.storage.from(bucket).download(arquivo.caminho)
      if (error || !data) continue
      const bytes = new Uint8Array(await data.arrayBuffer())
      const hash = createHash('sha1').update(`${bucket}/${arquivo.caminho}`).digest('hex').slice(0, 10)
      const nomeBase = arquivo.caminho.split('/').pop() || 'arquivo'
      const nomeDrive = `${bucket}__${hash}__${nomeBase}`.slice(-240)
      const enviado = await enviarArquivoDrive({
        accessToken,
        nome: nomeDrive,
        parentId: pastaDriveId,
        conteudo: bytes,
        contentType: data.type || 'application/octet-stream',
        descricao: `Origem Supabase Storage: ${bucket}/${arquivo.caminho}`,
      })
      await supabase.from('backup_storage_arquivos').upsert({
        bucket,
        caminho: arquivo.caminho,
        storage_atualizado_em: arquivo.atualizadoEm,
        tamanho_bytes: bytes.byteLength,
        google_arquivo_id: enviado.id,
        ultimo_backup_em: new Date().toISOString(),
      }, { onConflict: 'bucket,caminho' })
      enviados += 1
    }
  }
  return enviados
}

async function listarArquivosBucket(supabase: SupabaseClient, bucket: string) {
  const saida: Array<{ caminho: string; atualizadoEm: string | null }> = []
  try {
    await listarPasta('')
    return saida
  } catch {
    return null
  }

  async function listarPasta(prefixo: string) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefixo, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      const itens = data ?? []
      for (const item of itens) {
        const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
        if (item.id) {
          saida.push({ caminho, atualizadoEm: item.updated_at ?? item.created_at ?? null })
        } else {
          await listarPasta(caminho)
        }
      }
      if (itens.length < 1000) break
    }
  }
}

function erroTexto(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Erro no backup para o Google Drive.'
}
