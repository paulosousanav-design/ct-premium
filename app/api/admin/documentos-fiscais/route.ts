import { createClient } from '@supabase/supabase-js'
import { createSecureContext } from 'node:tls'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'
import { cabecalhosAuditoria, type AtorAuditoria } from '@/lib/auditoria-contexto'
import { criptografarSegredo } from '@/lib/google-drive'
import { sincronizarDocumentosDfe } from '@/lib/dfe-sync'
import { registrarEventoSistema } from '@/lib/monitoramento'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAX_CERTIFICADO_BYTES = 100 * 1024

function db(request?: NextRequest, ator?: AtorAuditoria) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuração do Supabase ausente.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: request && ator ? { headers: cabecalhosAuditoria(request, ator) } : undefined,
  })
}

async function estruturaExiste(supabase: ReturnType<typeof db>) {
  const [configuracoes, documentos] = await Promise.all([
    supabase.from('dfe_configuracoes').select('id').limit(0),
    supabase.from('dfe_documentos').select('id').limit(0),
  ])
  return !configuracoes.error && !documentos.error
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'documentos_fiscais')
    if (!auth.ok) return auth.response
    const supabase = db()
    if (!(await estruturaExiste(supabase))) {
      return NextResponse.json({ estruturaPendente: true, documentos: [], configuracao: null })
    }

    const id = Number(request.nextUrl.searchParams.get('id'))
    if (id && request.nextUrl.searchParams.get('xml') === '1') {
      const { data, error } = await supabase.from('dfe_documentos')
        .select('id, chave_acesso, tipo_documento, xml_documento, status')
        .eq('id', id).eq('unidade_id', auth.unidadeId).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Documento fiscal não encontrado.' }, { status: 404 })
      if (data.tipo_documento !== 'NFE_COMPLETA') {
        return NextResponse.json({ error: 'O XML completo ainda não foi liberado pela SEFAZ.' }, { status: 409 })
      }
      return NextResponse.json({ id: data.id, chaveAcesso: data.chave_acesso, xml: data.xml_documento, status: data.status })
    }

    const status = String(request.nextUrl.searchParams.get('status') ?? '').trim().toUpperCase()
    const busca = String(request.nextUrl.searchParams.get('busca') ?? '').trim().slice(0, 100)
    let query = supabase.from('dfe_documentos').select(
      'id, nsu, schema_xml, tipo_documento, chave_acesso, emitente_cnpj, emitente_nome, data_emissao, valor_total, situacao_sefaz, descricao_evento, status, nfe_importacao_id, recebido_em, tratado_por, tratado_em'
    ).eq('unidade_id', auth.unidadeId).order('recebido_em', { ascending: false }).limit(200)
    if (status && status !== 'TODOS') query = query.eq('status', status)
    if (busca) query = query.or(`chave_acesso.ilike.%${escaparFiltro(busca)}%,emitente_nome.ilike.%${escaparFiltro(busca)}%,emitente_cnpj.ilike.%${escaparFiltro(busca)}%`)

    const [{ data: documentos, error }, { data: configuracao, error: configError }, { data: unidade, error: unidadeError }] = await Promise.all([
      query,
      supabase.from('dfe_configuracoes').select(
        'id, cnpj, uf, certificado_nome, ultimo_nsu, max_nsu, consulta_ativa, ultima_consulta_em, ultima_consulta_status, ultima_consulta_erro, configurado_por, atualizado_em'
      ).eq('unidade_id', auth.unidadeId).maybeSingle(),
      supabase.from('unidades').select('id, codigo, nome_fantasia, cnpj, estado').eq('id', auth.unidadeId).maybeSingle(),
    ])
    if (error || configError || unidadeError) throw error || configError || unidadeError
    return NextResponse.json({ estruturaPendente: false, documentos: documentos ?? [], configuracao, unidade })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao carregar documentos fiscais.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'documentos_fiscais')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = String(body?.acao ?? '').trim().toUpperCase()
    const supabase = db(request, auth)
    if (!(await estruturaExiste(supabase))) {
      return NextResponse.json({ error: 'Execute supabase-add-documentos-fiscais-recebidos.sql no Supabase.' }, { status: 400 })
    }

    if (acao === 'SALVAR_CERTIFICADO') {
      const certificadoBase64 = limparBase64(body?.certificadoBase64)
      const senha = String(body?.senha ?? '')
      const nome = String(body?.certificadoNome ?? 'certificado-a1.pfx').trim().slice(0, 180)
      if (!certificadoBase64 || !senha) return NextResponse.json({ error: 'Selecione o certificado A1 e informe a senha.' }, { status: 400 })

      const { data: unidade, error: unidadeError } = await supabase.from('unidades').select('cnpj, estado').eq('id', auth.unidadeId).maybeSingle()
      if (unidadeError) throw unidadeError
      const cnpj = digitos(unidade?.cnpj)
      const uf = String(unidade?.estado ?? '').trim().toUpperCase()
      if (cnpj.length !== 14 || !UF_VALIDAS.has(uf)) {
        return NextResponse.json({ error: 'Cadastre o CNPJ e a UF corretamente em Matriz e Filiais antes de salvar o certificado.' }, { status: 400 })
      }

      const pfx = Buffer.from(certificadoBase64, 'base64')
      if (!pfx.length || pfx.length > MAX_CERTIFICADO_BYTES) return NextResponse.json({ error: 'O certificado A1 é inválido ou excede 100 KB.' }, { status: 400 })
      try {
        createSecureContext({ pfx, passphrase: senha, minVersion: 'TLSv1.2' })
      } catch (error) {
        const detalhe = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        console.error('Falha segura ao validar certificado A1:', detalhe)
        if (/unsupported|digital envelope|algorithm|cipher/i.test(detalhe)) {
          return NextResponse.json({
            error: 'A senha está correta, mas este PFX usa criptografia antiga incompatível com o servidor. Reexporte o mesmo certificado no padrão AES-256/SHA-256 e tente novamente.',
            codigo: 'CERTIFICADO_FORMATO_LEGADO',
          }, { status: 400 })
        }
        if (/mac verify|password|passphrase|decrypt/i.test(detalhe)) {
          return NextResponse.json({ error: 'Não foi possível abrir o certificado A1. O arquivo foi reconhecido, mas a senha não foi validada.' }, { status: 400 })
        }
        return NextResponse.json({ error: 'O arquivo PFX não pôde ser aberto pelo servidor. Reexporte o certificado no padrão AES-256/SHA-256 e tente novamente.' }, { status: 400 })
      }
      const agora = new Date().toISOString()
      const { error } = await supabase.from('dfe_configuracoes').upsert({
        unidade_id: auth.unidadeId,
        cnpj,
        uf,
        ambiente: 1,
        certificado_pfx_criptografado: criptografarSegredo(certificadoBase64),
        certificado_senha_criptografada: criptografarSegredo(senha),
        certificado_nome: nome,
        consulta_ativa: true,
        ultima_consulta_status: null,
        ultima_consulta_erro: null,
        configurado_por: `${auth.nome} (${auth.email})`,
        atualizado_em: agora,
      }, { onConflict: 'unidade_id' })
      if (error) throw error
      return NextResponse.json({ ok: true, mensagem: 'Certificado A1 armazenado de forma criptografada.' })
    }

    if (acao === 'SINCRONIZAR') {
      const { data: configuracao, error } = await supabase.from('dfe_configuracoes').select('*').eq('unidade_id', auth.unidadeId).maybeSingle()
      if (error) throw error
      if (!configuracao) return NextResponse.json({ error: 'Configure o certificado A1 desta unidade.' }, { status: 400 })
      const resultado = await sincronizarDocumentosDfe(supabase, configuracao)
      return NextResponse.json({ ok: true, resultado })
    }

    if (['ARQUIVAR', 'REABRIR', 'IGNORAR'].includes(acao)) {
      const id = Number(body?.id)
      if (!id) return NextResponse.json({ error: 'Documento fiscal inválido.' }, { status: 400 })
      const status = acao === 'ARQUIVAR' ? 'ARQUIVADA' : acao === 'IGNORAR' ? 'IGNORADA' : 'NOVA'
      const { error } = await supabase.from('dfe_documentos').update({
        status,
        tratado_por: `${auth.nome} (${auth.email})`,
        tratado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      }).eq('id', id).eq('unidade_id', auth.unidadeId).neq('status', 'IMPORTADA')
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (acao === 'ALTERAR_AUTOMACAO') {
      const { error } = await supabase.from('dfe_configuracoes').update({
        consulta_ativa: body?.ativa === true,
        atualizado_em: new Date().toISOString(),
      }).eq('unidade_id', auth.unidadeId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'DOCUMENTOS_FISCAIS', gravidade: 'ATENCAO', request })
    return NextResponse.json({ error: mensagem(error, 'Erro ao processar documentos fiscais.') }, { status: 500 })
  }
}

function limparBase64(valor: unknown) { return String(valor ?? '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '') }
function digitos(valor: unknown) { return String(valor ?? '').replace(/\D/g, '') }
const UF_VALIDAS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
function escaparFiltro(valor: string) { return valor.replace(/[%_,()]/g, ' ').trim() }
function mensagem(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    return [obj.message, obj.details, obj.hint].filter(Boolean).map(String).join(' | ') || fallback
  }
  return fallback
}
