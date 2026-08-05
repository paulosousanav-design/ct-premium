import type { SupabaseClient } from '@supabase/supabase-js'

export type ContaFinanceira = {
  id: number
  unidade_id: number
  nome: string
  tipo: 'CAIXA' | 'BANCO' | 'CARTEIRA_DIGITAL' | 'ADQUIRENTE'
  ativa: boolean
  padrao_dinheiro?: boolean
}

export type LiquidacaoCartao = {
  taxaId: number | null
  taxaPercentual: number
  taxaFixa: number
  taxaValor: number
  valorLiquido: number
  prazoDias: number
  previsaoCredito: string | null
}

export async function validarContaFinanceira(supabase: SupabaseClient, unidadeId: number, contaId: unknown) {
  const id = Number(contaId)
  if (!id) throw new Error('Selecione a conta financeira de destino ou origem.')
  const { data, error } = await supabase.from('contas_financeiras').select('id, unidade_id, nome, tipo, ativa, padrao_dinheiro').eq('id', id).eq('unidade_id', unidadeId).eq('ativa', true).maybeSingle()
  if (error) {
    if (['42P01', 'PGRST205'].includes(String(error.code))) throw new Error('Execute o arquivo supabase-add-fechamento-caixa.sql antes de movimentar contas.')
    throw error
  }
  if (!data) throw new Error('Conta financeira inválida ou pertencente a outra unidade.')
  return data as ContaFinanceira
}

export async function calcularLiquidacaoCartao(
  supabase: SupabaseClient,
  entrada: { unidadeId: number; operadoraId: unknown; modalidade: unknown; parcelas: unknown; valorBruto: number }
): Promise<LiquidacaoCartao> {
  const valorBruto = dinheiro(entrada.valorBruto)
  const operadoraId = Number(entrada.operadoraId)
  const modalidade = String(entrada.modalidade ?? 'CREDITO').toUpperCase()
  const parcelas = Math.max(1, Math.min(24, Math.trunc(Number(entrada.parcelas) || 1)))
  if (!operadoraId) throw new Error('Selecione a operadora do cartão.')
  if (!['DEBITO', 'CREDITO', 'PIX'].includes(modalidade)) throw new Error('Modalidade de cartão inválida.')
  const { data: operadora, error: operadoraError } = await supabase.from('operadoras_cartao').select('id').eq('id', operadoraId).eq('unidade_id', entrada.unidadeId).eq('ativa', true).maybeSingle()
  if (operadoraError) throw operadoraError
  if (!operadora) throw new Error('Operadora inválida ou pertencente a outra unidade.')
  const { data: taxas, error } = await supabase.from('operadoras_cartao_taxas').select('id, taxa_percentual, taxa_fixa, prazo_dias, parcelas_de, parcelas_ate').eq('operadora_id', operadoraId).eq('modalidade', modalidade).eq('ativa', true).lte('parcelas_de', parcelas).gte('parcelas_ate', parcelas).order('parcelas_de', { ascending: false }).limit(1)
  if (error) throw error
  const taxa = taxas?.[0]
  if (!taxa) throw new Error(`Cadastre a taxa de ${modalidade.toLowerCase()} para ${parcelas} parcela(s).`)
  const percentual = numero(taxa.taxa_percentual)
  const fixa = numero(taxa.taxa_fixa)
  const calculo = calcularValorLiquidoCartao(valorBruto, percentual, fixa)
  const prazoDias = Math.max(0, Number(taxa.prazo_dias) || 0)
  return {
    taxaId: Number(taxa.id), taxaPercentual: percentual, taxaFixa: fixa, taxaValor: calculo.taxaValor,
    valorLiquido: calculo.valorLiquido, prazoDias,
    previsaoCredito: adicionarDias(new Date(), prazoDias),
  }
}

export function calcularValorLiquidoCartao(valorBruto: unknown, taxaPercentual: unknown, taxaFixa: unknown = 0) {
  const bruto = dinheiro(valorBruto); const percentual = numero(taxaPercentual); const fixa = dinheiro(taxaFixa)
  if (bruto < 0 || percentual < 0 || percentual > 100 || fixa < 0) throw new Error('Valores de cartão inválidos.')
  const taxaValor = dinheiro(bruto * percentual / 100 + fixa)
  return { valorBruto: bruto, taxaValor, valorLiquido: dinheiro(Math.max(bruto - taxaValor, 0)) }
}

export async function registrarMovimentoFinanceiro(supabase: SupabaseClient, item: {
  unidadeId: number; contaId: number; natureza: 'ENTRADA' | 'SAIDA'; tipo: string; forma: string
  valorBruto: number; taxaValor?: number; valorLiquido?: number; operadoraId?: number | null
  taxaId?: number | null; taxaPercentual?: number; parcelas?: number; previsaoCredito?: string | null
  origemTipo?: string; origemId?: string | number | null; descricao: string
  usuarioId?: number | null; nome: string; email: string; contaContrapartidaId?: number | null; grupoTransferencia?: string | null
}) {
  const { error } = await supabase.from('movimentos_financeiros').insert({
    unidade_id: item.unidadeId, conta_financeira_id: item.contaId,
    conta_contrapartida_id: item.contaContrapartidaId ?? null, natureza: item.natureza,
    tipo: item.tipo, forma: item.forma, valor_bruto: dinheiro(item.valorBruto),
    taxa_valor: dinheiro(item.taxaValor ?? 0), valor_liquido: dinheiro(item.valorLiquido ?? item.valorBruto),
    operadora_id: item.operadoraId ?? null, taxa_id: item.taxaId ?? null,
    taxa_percentual: numero(item.taxaPercentual), parcelas: Math.max(1, Number(item.parcelas) || 1),
    previsao_credito: item.previsaoCredito ?? null, origem_tipo: item.origemTipo ?? null,
    origem_id: item.origemId === null || item.origemId === undefined ? null : String(item.origemId),
    grupo_transferencia: item.grupoTransferencia ?? null, descricao: item.descricao,
    criado_por_id: item.usuarioId ?? null, criado_por_nome: item.nome, criado_por_email: item.email,
  })
  if (error) throw error
}

export function dinheiro(valor: unknown) { return Math.round(((numero(valor) + Number.EPSILON) * 100)) / 100 }
function numero(valor: unknown) { const n = Number(valor ?? 0); return Number.isFinite(n) ? n : 0 }
function adicionarDias(data: Date, dias: number) { const alvo = new Date(data); alvo.setDate(alvo.getDate() + dias); return alvo.toISOString().slice(0, 10) }
