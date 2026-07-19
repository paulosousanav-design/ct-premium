import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const falhas = []

const rotasAdmin = listar(join(root, 'app', 'api', 'admin')).filter((arquivo) => arquivo.endsWith('route.ts'))
for (const arquivo of rotasAdmin) {
  const conteudo = readFileSync(arquivo, 'utf8')
  if (!/requireAdmin(User|Permission|Unidade|EscopoGerencial)\s*\(/.test(conteudo)) {
    falhas.push(`${relativo(arquivo)} nao exige autenticacao administrativa.`)
  }
}

const publicasProtegidas = [
  'app/api/consulta/route.ts',
  'app/api/consulta/orcamento/route.ts',
  'app/api/tecnico/login/route.ts',
  'app/api/tecnicos/autocadastro/route.ts',
  'app/api/chamados/route.ts',
]
for (const caminho of publicasProtegidas) {
  const conteudo = readFileSync(join(root, caminho), 'utf8')
  if (!conteudo.includes('limitarRotaPublica(')) falhas.push(`${caminho} nao possui controle de tentativas.`)
}

const config = readFileSync(join(root, 'next.config.ts'), 'utf8')
for (const cabecalho of ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
  if (!config.includes(cabecalho)) falhas.push(`Cabecalho ${cabecalho} ausente no next.config.ts.`)
}

const clientes = listar(join(root, 'app')).filter((arquivo) => arquivo.endsWith('.tsx'))
const acessoDiretoPermitido = new Set([
  'app/admin/os/page.tsx',
  'app/admin/os/[id]/page.tsx',
])
for (const arquivo of clientes) {
  const conteudo = readFileSync(arquivo, 'utf8')
  const caminho = relativo(arquivo)
  if (conteudo.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    falhas.push(`${relativo(arquivo)} expoe a chave service_role em componente React.`)
  }
  if (caminho.startsWith('app/admin/') && /supabase\s*\.from\s*\(/.test(conteudo) && !acessoDiretoPermitido.has(caminho)) {
    falhas.push(`${caminho} acessa tabelas diretamente fora da lista temporaria de migracao.`)
  }
}

if (falhas.length) {
  console.error('Verificacao de seguranca reprovada:')
  for (const falha of falhas) console.error(`- ${falha}`)
  process.exit(1)
}

console.log(`Verificacao de seguranca aprovada: ${rotasAdmin.length} rotas administrativas, ${publicasProtegidas.length} rotas publicas e ${acessoDiretoPermitido.size} telas temporarias verificadas.`)

function listar(diretorio) {
  const arquivos = []
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome)
    if (statSync(caminho).isDirectory()) arquivos.push(...listar(caminho))
    else arquivos.push(caminho)
  }
  return arquivos
}

function relativo(caminho) { return relative(root, caminho).replaceAll('\\', '/') }
