import type { SupabaseClient } from '@supabase/supabase-js'

export const TABELAS_BACKUP = [
  'empresas', 'unidades', 'admin_usuario_unidades',
  'academia_conteudos', 'academia_conteudo_tecnicos', 'academia_progresso',
  'documento_emissores', 'documento_carimbos', 'documentos_tecnicos', 'documento_historico',
  'clientes', 'ordens_servico', 'os_historico', 'os_fotos', 'os_pecas',
  'categorias', 'marcas', 'parceiros', 'garantidores',
  'pecas', 'pecas_movimentacoes', 'nfe_importacoes', 'nfe_importacao_itens',
  'contas_pagar', 'financeiro_historico', 'contas_financeiras', 'operadoras_cartao', 'operadoras_cartao_taxas',
  'movimentos_financeiros', 'caixa_sessoes', 'caixa_movimentos', 'auditoria_eventos', 'sistema_eventos',
  'backup_execucoes', 'backup_configuracoes', 'backup_storage_arquivos',
  'tecnico_documentos', 'admin_usuarios',
  'chat_conversas', 'chat_participantes', 'chat_mensagens', 'chat_leituras',
  'recebimento_parcelas', 'vendas', 'venda_itens',
] as const

export async function gerarBackupDados(
  supabase: SupabaseClient,
  input: { tipo: 'backup_manual' | 'backup_automatico'; geradoPor: string; data?: Date }
) {
  const geradoEm = input.data ?? new Date()
  const tabelas: Record<string, { total: number; dados: unknown[] }> = {}
  const ignoradas: Array<{ tabela: string; motivo: string }> = []

  for (const tabela of TABELAS_BACKUP) {
    if (!await tabelaExiste(supabase, tabela)) {
      ignoradas.push({ tabela, motivo: 'Tabela nao encontrada neste banco.' })
      continue
    }
    tabelas[tabela] = await carregarTabela(supabase, tabela)
  }

  const backup = {
    metadata: {
      sistema: 'Chame o Tecnico',
      tipo: input.tipo,
      gerado_em: geradoEm.toISOString(),
      gerado_por: input.geradoPor,
      formato: 'json',
      observacao: 'Backup de dados. Anexos fisicos sao copiados separadamente na rotina em nuvem.',
    },
    tabelas,
    tabelas_ignoradas: ignoradas,
  }
  const nomeArquivo = `backup-chame-o-tecnico-${formatarNomeArquivo(geradoEm)}.json`
  const conteudo = JSON.stringify(backup, null, 2)
  const totalRegistros = Object.values(tabelas).reduce((soma, tabela) => soma + tabela.total, 0)
  return {
    geradoEm,
    nomeArquivo,
    conteudo,
    totalRegistros,
    totalTabelas: Object.keys(tabelas).length,
    tabelasIgnoradas: ignoradas.length,
  }
}

async function tabelaExiste(supabase: SupabaseClient, tabela: string) {
  const { error } = await supabase.from(tabela).select('*').limit(0)
  return !error
}

async function carregarTabela(supabase: SupabaseClient, tabela: string) {
  const pagina = 1000
  const linhas: unknown[] = []
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabase.from(tabela).select('*').range(inicio, inicio + pagina - 1)
    if (error) throw new Error(`Erro ao exportar ${tabela}: ${error.message}`)
    const lote = data ?? []
    linhas.push(...lote)
    if (lote.length < pagina) break
  }
  return { total: linhas.length, dados: linhas }
}

function formatarNomeArquivo(data: Date) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  const hora = String(data.getHours()).padStart(2, '0')
  const minuto = String(data.getMinutes()).padStart(2, '0')
  return `${ano}-${mes}-${dia}-${hora}${minuto}`
}
