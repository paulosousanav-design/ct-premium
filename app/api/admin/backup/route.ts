import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const tabelasBackup = [
  'empresas',
  'unidades',
  'admin_usuario_unidades',
  'academia_conteudos',
  'academia_conteudo_tecnicos',
  'academia_progresso',
  'documento_emissores',
  'documento_carimbos',
  'documentos_tecnicos',
  'documento_historico',
  'clientes',
  'ordens_servico',
  'os_historico',
  'os_fotos',
  'os_pecas',
  'categorias',
  'marcas',
  'parceiros',
  'garantidores',
  'pecas',
  'pecas_movimentacoes',
  'nfe_importacoes',
  'nfe_importacao_itens',
  'contas_pagar',
  'financeiro_historico',
  'tecnico_documentos',
  'admin_usuarios',
  'recebimento_parcelas',
  'vendas',
  'venda_itens',
]

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
  try {
    const auth = await requireAdminPermission(request, 'configuracoes')
    if (!auth.ok) return auth.response

    if (!auth.permissoes.includes('usuarios')) {
      return NextResponse.json(
        { error: 'Apenas o ADM Master pode gerar backup completo do sistema.' },
        { status: 403 }
      )
    }

    const supabase = getSupabaseAdmin()
    const geradoEm = new Date()
    const backup: Record<string, unknown> = {
      metadata: {
        sistema: 'Chame o Tecnico',
        tipo: 'backup_manual',
        gerado_em: geradoEm.toISOString(),
        gerado_por: auth.email,
        formato: 'json',
        observacao: 'Backup manual de dados. Anexos e fotos sao salvos como URLs cadastradas no banco.',
      },
      tabelas: {},
      tabelas_ignoradas: [],
    }

    const tabelas = backup.tabelas as Record<string, unknown>
    const ignoradas = backup.tabelas_ignoradas as Array<{ tabela: string; motivo: string }>

    for (const tabela of tabelasBackup) {
      const existe = await tabelaExiste(supabase, tabela)
      if (!existe) {
        ignoradas.push({ tabela, motivo: 'Tabela nao encontrada neste banco.' })
        continue
      }

      tabelas[tabela] = await carregarTabela(supabase, tabela)
    }

    const nomeArquivo = `backup-chame-o-tecnico-${formatarNomeArquivo(geradoEm)}.json`
    const conteudo = JSON.stringify(backup, null, 2)

    return new NextResponse(conteudo, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Erro ao gerar backup:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao gerar backup do sistema.') },
      { status: 500 }
    )
  }
}

async function tabelaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

async function carregarTabela(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) {
  const pagina = 1000
  const linhas: unknown[] = []

  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .range(inicio, inicio + pagina - 1)

    if (error) throw new Error(`Erro ao exportar ${tabela}: ${error.message}`)

    const lote = data ?? []
    linhas.push(...lote)
    if (lote.length < pagina) break
  }

  return {
    total: linhas.length,
    dados: linhas,
  }
}

function formatarNomeArquivo(data: Date) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  const hora = String(data.getHours()).padStart(2, '0')
  const minuto = String(data.getMinutes()).padStart(2, '0')
  return `${ano}-${mes}-${dia}-${hora}${minuto}`
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
