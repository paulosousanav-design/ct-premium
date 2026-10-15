type Categoria = { id: number; nome: string }
type Marca = { id: number; nome: string; categoria_id: number | null }

const categoriasPublicas: Array<{ nome: string; termos: string[]; excluir?: string[] }> = [
  { nome: 'Smart TV', termos: ['televis'] },
  { nome: 'Ar Condicionado', termos: ['ar condicionado'] },
  { nome: 'Refrigerador', termos: ['refriger'] },
  { nome: 'Lavadora', termos: ['lavadoras', 'maquina de lavar', 'maquinas de lavar'], excluir: ['alta pressao'] },
  { nome: 'Informática', termos: ['informatica', 'monitor'] },
  { nome: 'Inversor Solar', termos: ['inversor'] },
  { nome: 'Outros serviços', termos: ['eletronicos em geral'] },
]

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function encontrarCategoria(categorias: Categoria[], termos: string[], excluir: string[] = []) {
  const bloqueios = excluir.map((termo) => normalizar(termo))
  return categorias.find((categoria) => {
    const nome = normalizar(categoria.nome)
    if (bloqueios.some((termo) => nome.includes(termo))) return false
    return termos.some((termo) => nome.includes(normalizar(termo)))
  })
}

export function prepararCategoriasPublicas(categorias: Categoria[]) {
  const origem = categorias.length > 0 ? categorias : categoriasFallback

  return categoriasPublicas
    .map((item, index) => {
      const categoria = encontrarCategoria(origem, item.termos, item.excluir)
      if (!categoria) return null
      return {
        id: categoria.id,
        nome: item.nome,
        key: `${categoria.id}-${index}`,
      }
    })
    .filter((categoria): categoria is Categoria & { key: string } => Boolean(categoria))
}

export function prepararMarcasPublicas(marcas: Marca[], categorias: Categoria[]) {
  const lavadora = encontrarCategoria(categorias, ['lavadoras'], ['alta pressao'])
  const maquinaLavar = encontrarCategoria(categorias, ['maquina de lavar', 'maquinas de lavar'])

  if (!lavadora || !maquinaLavar || lavadora.id === maquinaLavar.id) return marcas

  return marcas.map((marca) => ({
    ...marca,
    categoria_id: marca.categoria_id === maquinaLavar.id ? lavadora.id : marca.categoria_id,
  }))
}

const nomesCanonicos: Record<string, string> = {
  eletrolux: 'Electrolux',
}

function chaveMarca(nome: string) {
  const base = normalizar(nome)
  const canonico = nomesCanonicos[base]
  return canonico ? normalizar(canonico) : base
}

function rotuloMarca(nome: string) {
  return nomesCanonicos[normalizar(nome)] ?? nome
}

function prefereRotulo(atual: string, candidato: string) {
  if (nomesCanonicos[normalizar(candidato)]) return false
  if (nomesCanonicos[normalizar(atual)]) return true
  const caixa = (nome: string) => {
    const letras = nome.replace(/[^A-Za-zÀ-ÿ]/g, '')
    if (letras.length < 2) return 1
    const maiusculas = letras.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g, '').length
    return maiusculas === letras.length ? 0 : 1
  }
  return caixa(candidato) > caixa(atual)
}

export function listarMarcasDoFormulario(marcas: Marca[], categoriaId?: string | number | null) {
  const categoria = categoriaId ? String(categoriaId) : ''
  const escolhidas = new Map<string, Marca>()

  for (const marca of marcas) {
    if (categoria && String(marca.categoria_id ?? '') !== categoria) continue
    const chave = chaveMarca(marca.nome)
    if (!chave || chave === 'outra') continue

    const atual = escolhidas.get(chave)
    if (!atual || prefereRotulo(atual.nome, marca.nome)) {
      escolhidas.set(chave, { ...marca, nome: rotuloMarca(marca.nome) })
    }
  }

  return [...escolhidas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

const categoriasFallback: Categoria[] = [
  { id: 19, nome: 'Ar Condicionado' },
  { id: 23, nome: 'Monitor' },
  { id: 16, nome: 'Eletronicos em Geral' },
  { id: 22, nome: 'Inversores Solares' },
  { id: 17, nome: 'Lavadoras' },
  { id: 20, nome: 'Maquinas de Lavar' },
  { id: 18, nome: 'Refrigeradores' },
  { id: 21, nome: 'Televisores' },
]
