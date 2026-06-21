type Categoria = { id: number; nome: string }
type Marca = { id: number; nome: string; categoria_id: number | null }

const categoriasPublicas = [
  { nome: 'Smart TV', termos: ['televis'] },
  { nome: 'Ar Condicionado', termos: ['ar condicionado'] },
  { nome: 'Refrigerador', termos: ['refriger'] },
  { nome: 'Lavadora', termos: ['lavadora', 'maquina de lavar', 'maquinas de lavar'] },
  { nome: 'Informatica', termos: ['informatica', 'eletronicos em geral'] },
  { nome: 'Inversor Solar', termos: ['inversor'] },
  { nome: 'Outros Servicos', termos: ['outros', 'eletronicos em geral'] },
]

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function encontrarCategoria(categorias: Categoria[], termos: string[]) {
  return categorias.find((categoria) => {
    const nome = normalizar(categoria.nome)
    return termos.some((termo) => nome.includes(normalizar(termo)))
  })
}

export function prepararCategoriasPublicas(categorias: Categoria[]) {
  const origem = categorias.length > 0 ? categorias : categoriasFallback

  return categoriasPublicas
    .map((item, index) => {
      const categoria = encontrarCategoria(origem, item.termos)
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
  const lavadora = encontrarCategoria(categorias, ['lavadora'])
  const maquinaLavar = encontrarCategoria(categorias, ['maquina de lavar', 'maquinas de lavar'])

  if (!lavadora || !maquinaLavar || lavadora.id === maquinaLavar.id) return marcas

  return marcas.map((marca) => ({
    ...marca,
    categoria_id: marca.categoria_id === maquinaLavar.id ? lavadora.id : marca.categoria_id,
  }))
}

const categoriasFallback: Categoria[] = [
  { id: 19, nome: 'Ar Condicionado' },
  { id: 16, nome: 'Eletronicos em Geral' },
  { id: 22, nome: 'Inversores Solares' },
  { id: 17, nome: 'Lavadoras' },
  { id: 20, nome: 'Maquinas de Lavar' },
  { id: 18, nome: 'Refrigeradores' },
  { id: 21, nome: 'Televisores' },
]
