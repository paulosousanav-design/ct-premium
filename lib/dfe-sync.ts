import type { SupabaseClient } from '@supabase/supabase-js'
import { consultarDistribuicaoDfe } from '@/lib/dfe-sefaz'
import { descriptografarSegredo } from '@/lib/google-drive'

type ConfiguracaoDfe = {
  id: number
  unidade_id: number
  cnpj: string
  uf: string
  certificado_pfx_criptografado: string
  certificado_senha_criptografada: string
  ultimo_nsu: string
  consulta_ativa: boolean
}

export async function sincronizarDocumentosDfe(supabase: SupabaseClient, configuracao: ConfiguracaoDfe) {
  if (!configuracao.consulta_ativa) throw new Error('A consulta automática desta unidade está pausada.')
  const pfxBase64 = descriptografarSegredo(configuracao.certificado_pfx_criptografado)
  const senha = descriptografarSegredo(configuracao.certificado_senha_criptografada)
  const pfx = Buffer.from(pfxBase64, 'base64')
  let ultimoNsu = configuracao.ultimo_nsu || '000000000000000'
  let maxNsu = ultimoNsu
  let encontrados = 0
  let completos = 0
  let lotes = 0

  try {
    while (lotes < 20) {
      const resultado = await consultarDistribuicaoDfe({
        cnpj: configuracao.cnpj,
        uf: configuracao.uf,
        ultimoNsu,
        pfx,
        senha,
      })
      lotes += 1
      ultimoNsu = resultado.ultimoNsu
      maxNsu = resultado.maxNsu

      for (const documento of resultado.documentos) {
        const status = documento.tipo === 'NFE_COMPLETA' ? 'XML_DISPONIVEL' : 'NOVA'
        const { error } = await supabase.from('dfe_documentos').upsert({
          unidade_id: configuracao.unidade_id,
          nsu: documento.nsu,
          schema_xml: documento.schema,
          tipo_documento: documento.tipo,
          chave_acesso: documento.chaveAcesso || null,
          emitente_cnpj: documento.emitenteCnpj || null,
          emitente_nome: documento.emitenteNome || null,
          data_emissao: dataValida(documento.dataEmissao),
          valor_total: documento.valorTotal,
          situacao_sefaz: documento.situacao,
          descricao_evento: documento.evento,
          status,
          xml_documento: documento.xml,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'unidade_id,nsu,schema_xml', ignoreDuplicates: true })
        if (error) throw error
        encontrados += 1
        if (documento.tipo === 'NFE_COMPLETA') {
          completos += 1
          if (documento.chaveAcesso) {
            const { error: resumoError } = await supabase.from('dfe_documentos').update({
              status: 'ARQUIVADA',
              atualizado_em: new Date().toISOString(),
            }).eq('unidade_id', configuracao.unidade_id)
              .eq('chave_acesso', documento.chaveAcesso)
              .eq('tipo_documento', 'RESUMO_NFE')
              .neq('status', 'IMPORTADA')
            if (resumoError) throw resumoError
          }
        }
      }

      if (resultado.cStat === '137' || BigInt(ultimoNsu || '0') >= BigInt(maxNsu || '0')) break
    }

    const agora = new Date().toISOString()
    const { error: updateError } = await supabase.from('dfe_configuracoes').update({
      ultimo_nsu: ultimoNsu,
      max_nsu: maxNsu,
      ultima_consulta_em: agora,
      ultima_consulta_status: 'CONCLUIDA',
      ultima_consulta_erro: null,
      atualizado_em: agora,
    }).eq('id', configuracao.id)
    if (updateError) throw updateError
    return { encontrados, completos, lotes, ultimoNsu, maxNsu, pendente: BigInt(ultimoNsu || '0') < BigInt(maxNsu || '0') }
  } catch (error) {
    const mensagem = erro(error)
    await supabase.from('dfe_configuracoes').update({
      ultima_consulta_em: new Date().toISOString(),
      ultima_consulta_status: 'FALHA',
      ultima_consulta_erro: mensagem,
      atualizado_em: new Date().toISOString(),
    }).eq('id', configuracao.id)
    throw error
  }
}

function dataValida(valor: string | null) {
  if (!valor) return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

function erro(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Erro ao sincronizar documentos fiscais.'
}
