import assert from 'node:assert/strict'
import test from 'node:test'
import { listarMarcasDoFormulario } from '../lib/public-equipment.ts'

const marcas = [
  { id: 68, nome: 'AOC', categoria_id: 21 },
  { id: 69, nome: 'AOC', categoria_id: 16 },
  { id: 72, nome: 'Brastemp', categoria_id: 17 },
  { id: 74, nome: 'Brastemp', categoria_id: 17 },
  { id: 65, nome: 'Brastemp', categoria_id: 18 },
  { id: 90, nome: 'Outra', categoria_id: 21 },
  { id: 50, nome: 'Consul', categoria_id: 18 },
]

test('lista cada marca uma vez e deixa Outra para o formulario', () => {
  const nomes = listarMarcasDoFormulario(marcas).map((marca) => marca.nome)
  assert.deepEqual(nomes, ['AOC', 'Brastemp', 'Consul'])
})

test('filtra a marca pelo tipo e remove a repeticao da mesma categoria', () => {
  const nomes = listarMarcasDoFormulario(marcas, 17).map((marca) => marca.nome)
  assert.deepEqual(nomes, ['Brastemp'])
})

test('une grafia parecida e prefere o nome com caixa mista', () => {
  const nomes = listarMarcasDoFormulario([
    { id: 104, nome: 'Eletrolux', categoria_id: 25 },
    { id: 85, nome: 'Electrolux', categoria_id: 20 },
    { id: 120, nome: 'MULTILASER', categoria_id: 21 },
    { id: 79, nome: 'Multilaser', categoria_id: 16 },
  ]).map((marca) => marca.nome)

  assert.deepEqual(nomes, ['Electrolux', 'Multilaser'])
})
