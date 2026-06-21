import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const colunasParceiros = [
  'chave_pix',
  'especialidades',
  'observacoes',
  'portal_pin_hash',
  'tipo_vinculo',
] as const

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
    const auth = await requireAdminPermission(request, 'tecnicos')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const parceiros = await Promise.all(
      colunasParceiros.map(async (coluna) => {
        const { error } = await supabase.from('parceiros').select(coluna).limit(0)

        return {
          coluna,
          ok: !error,
          erro: error ? formatarErro(error, 'Coluna nao localizada.') : null,
        }
      })
    )

    const faltando = parceiros.filter((item) => !item.ok).map((item) => item.coluna)

    return NextResponse.json({
      ok: faltando.length === 0,
      parceiros,
      faltando,
      sql: [
        'alter table parceiros',
        'add column if not exists chave_pix text;',
        '',
        'alter table parceiros',
        'add column if not exists especialidades text[];',
        '',
        'alter table parceiros',
        'add column if not exists observacoes text;',
        '',
        'alter table parceiros',
        'add column if not exists portal_pin_hash text;',
        '',
        'alter table parceiros',
        "add column if not exists tipo_vinculo text not null default 'TERCEIRIZADO';",
        '',
        'create table if not exists tecnico_documentos (',
        '  id bigserial primary key,',
        '  os_id bigint references ordens_servico(id),',
        '  parceiro_id bigint references parceiros(id),',
        "  tipo text not null default 'RECIBO',",
        '  valor numeric(12, 2) not null default 0,',
        '  nome_arquivo text,',
        '  url text,',
        '  observacao text,',
        "  status text not null default 'PENDENTE',",
        '  criado_em timestamptz not null default now(),',
        '  pago_em timestamptz',
        ');',
        '',
        'alter table tecnico_documentos',
        'add column if not exists os_id bigint references ordens_servico(id);',
        '',
        "insert into storage.buckets (id, name, public) values ('tecnico-documentos', 'tecnico-documentos', true)",
        'on conflict (id) do update set public = excluded.public;',
      ].join('\n'),
    })
  } catch (error) {
    console.error('Erro ao verificar estrutura do banco:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao verificar estrutura do banco.') },
      { status: 500 }
    )
  }
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
