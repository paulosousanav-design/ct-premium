import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'os')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)

    const nomeCliente = String(body?.nomeCliente ?? '').trim()
    const cpfCnpj = String(body?.cpfCnpj ?? '').trim()
    const whatsapp = String(body?.whatsapp ?? '').trim()
    const categoriaId = Number(body?.categoriaId)
    const marcaId = Number(body?.marcaId)
    const modelo = String(body?.modelo ?? '').trim()
    const defeito = String(body?.defeito ?? '').trim()
    const garantia = body?.garantia === 'SIM'

    if (!nomeCliente || !cpfCnpj || !whatsapp || !categoriaId || !marcaId || !modelo || !defeito) {
      return NextResponse.json(
        { error: 'Preencha os campos obrigatorios da OS.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const email = String(body?.email ?? '').trim()
    const clientePayload = {
      nome: nomeCliente,
      cpf_cnpj: cpfCnpj,
      whatsapp,
      email: email || null,
      cep: String(body?.cep ?? '').trim() || null,
      logradouro: String(body?.rua ?? '').trim() || null,
      numero: String(body?.numero ?? '').trim() || null,
      bairro: String(body?.bairro ?? '').trim() || null,
      cidade: String(body?.cidade ?? '').trim() || null,
      estado: String(body?.estado ?? '').trim() || null,
    }

    const { data: novoCliente, error: novoClienteError } = await supabase
      .from('clientes')
      .insert(clientePayload)
      .select('id')
      .single()

    if (novoClienteError) throw novoClienteError
    const clienteId = novoCliente.id

    const numeroOS = gerarNumeroOS()

    const { data: osCriada, error: osError } = await supabase
      .from('ordens_servico')
      .insert({
        numero_os: numeroOS,
        cliente_id: Number(clienteId),
        categoria_id: categoriaId,
        marca_id: marcaId,
        modelo,
        numero_serie: String(body?.numeroSerie ?? '').trim() || null,
        garantia,
        data_compra: garantia ? String(body?.dataCompra ?? '').trim() || null : null,
        numero_nf: garantia ? String(body?.numeroNf ?? '').trim() || null : null,
        local_compra: garantia ? String(body?.localCompra ?? '').trim() || null : null,
        defeito,
        status: 'NOVA',
        prioridade: body?.prioridade === 'URGENTE' ? 'URGENTE' : 'NORMAL',
        parceiro_id: null,
        sla_status: 'NORMAL',
      })
      .select('id')
      .single()

    if (osError) throw osError
    if (!osCriada?.id) throw new Error('A OS foi criada, mas o ID nao retornou.')

    return NextResponse.json({ ok: true, id: osCriada.id, numeroOS })
  } catch (error) {
    console.error('Erro ao criar OS:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao criar a OS.') },
      { status: 500 }
    )
  }
}

function gerarNumeroOS() {
  const agora = new Date()
  const ano = String(agora.getFullYear()).slice(-2)
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  const sequencia = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')

  return `CT${ano}${mes}${dia}${sequencia}`
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code]
      .filter(Boolean)
      .map(String)

    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
