import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'
import { PRAZO_BACKUP_DIAS, situacaoBackup } from '@/lib/backup'
import { gerarBackupDados } from '@/lib/backup-dados'
import { criarFingerprint, registrarEventoSistema } from '@/lib/monitoramento'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuracao do Supabase ausente no servidor.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function GET(request: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin> | null = null
  let ator: { nome: string; email: string } | null = null
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    ator = { nome: auth.nome, email: auth.email }
    supabase = getSupabaseAdmin()

    if (request.nextUrl.searchParams.get('acao') === 'historico') {
      return carregarHistorico(supabase, request)
    }

    const resultado = await gerarBackupDados(supabase, { tipo: 'backup_manual', geradoPor: auth.email })
    const { nomeArquivo, conteudo } = resultado
    const tamanhoBytes = Buffer.byteLength(conteudo, 'utf8')
    const checksum = createHash('sha256').update(conteudo).digest('hex')

    await registrarExecucao(supabase, {
      tipo: 'MANUAL',
      status: 'CONCLUIDO',
      integridade: 'VALIDA',
      arquivo_nome: nomeArquivo,
      tamanho_bytes: tamanhoBytes,
      checksum_sha256: checksum,
      total_tabelas: resultado.totalTabelas,
      total_registros: resultado.totalRegistros,
      tabelas_ignoradas: resultado.tabelasIgnoradas,
      gerado_por_nome: auth.nome,
      gerado_por_email: auth.email,
    })

    return new NextResponse(conteudo, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Cache-Control': 'no-store',
        'X-Backup-Sha256': checksum,
      },
    })
  } catch (error) {
    console.error('Erro ao gerar backup:', error)
    if (supabase && ator && request.nextUrl.searchParams.get('acao') !== 'historico') {
      await registrarExecucao(supabase, {
        tipo: 'MANUAL',
        status: 'FALHA',
        integridade: 'INVALIDA',
        gerado_por_nome: ator.nome,
        gerado_por_email: ator.email,
        erro: formatarErro(error, 'Erro ao gerar backup do sistema.'),
      })
    }
    await registrarEventoSistema({ error, modulo: 'BACKUP', gravidade: 'CRITICO', request })
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao gerar backup do sistema.') },
      { status: 500 }
    )
  }
}

async function carregarHistorico(supabase: ReturnType<typeof getSupabaseAdmin>, request: NextRequest) {
  const { error: estruturaError } = await supabase.from('backup_execucoes').select('*').limit(0)
  if (estruturaError && ['42P01', 'PGRST205'].includes(String(estruturaError.code))) {
    return NextResponse.json({
      estruturaPendente: true,
      execucoes: [],
      resumo: { situacao: 'SEM_BACKUP', ultimoBackup: null, prazoDias: PRAZO_BACKUP_DIAS },
    })
  }
  if (estruturaError) throw estruturaError

  const { data, error } = await supabase
    .from('backup_execucoes')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(50)
  if (error) throw error

  const execucoes = data ?? []
  const ultimoValido = execucoes.find((item) => item.status === 'CONCLUIDO' && item.integridade === 'VALIDA')
  const situacao = situacaoBackup(ultimoValido?.criado_em)
  await sincronizarAlertaBackup(supabase, request, situacao)

  return NextResponse.json({
    estruturaPendente: false,
    execucoes,
    resumo: {
      situacao,
      ultimoBackup: ultimoValido?.criado_em ?? null,
      prazoDias: PRAZO_BACKUP_DIAS,
      totalExecucoes: execucoes.length,
      ultimaExecucao: execucoes[0]?.criado_em ?? null,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

async function sincronizarAlertaBackup(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  request: NextRequest,
  situacao: ReturnType<typeof situacaoBackup>
) {
  const mensagem = 'Backup do sistema atrasado ou ainda nao realizado.'
  const fingerprint = criarFingerprint({
    modulo: 'BACKUP',
    origem: 'ALERTA',
    rota: request.nextUrl.pathname,
    codigo: 'BACKUP_ATRASADO',
    mensagem,
  })

  if (situacao === 'EM_DIA') {
    await supabase.from('sistema_eventos').update({
      status: 'RESOLVIDO',
      resolvido_em: new Date().toISOString(),
      resolvido_por_nome: 'Sistema',
      resolucao_observacao: 'Backup recente confirmado automaticamente.',
    }).eq('fingerprint', fingerprint).eq('status', 'ABERTO')
    return
  }

  const { data } = await supabase
    .from('sistema_eventos')
    .select('id')
    .eq('fingerprint', fingerprint)
    .eq('status', 'ABERTO')
    .maybeSingle()
  if (!data) {
    await registrarEventoSistema({
      tipo: 'ALERTA',
      gravidade: 'ATENCAO',
      modulo: 'BACKUP',
      origem: 'ALERTA',
      codigo: 'BACKUP_ATRASADO',
      mensagem,
      detalhes: { situacao, prazoDias: PRAZO_BACKUP_DIAS },
      request,
    })
  }
}

async function registrarExecucao(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from('backup_execucoes').insert(payload)
  if (error && !['42P01', 'PGRST205'].includes(String(error.code))) {
    console.error('Erro ao registrar historico do backup:', error)
  }
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code].filter(Boolean).map(String)
    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
