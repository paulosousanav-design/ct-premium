import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularRotaGoogle } from '../lib/google-routes.ts'

test('calcula percurso otimizado e distancia individual de cada OS', async () => {
  const fetchOriginal = globalThis.fetch
  let chamada = 0
  globalThis.fetch = (async () => {
    chamada += 1
    if (chamada === 1) {
      return new Response(JSON.stringify({
        routes: [{
          distanceMeters: 720_450,
          duration: '28800s',
          optimizedIntermediateWaypointIndex: [1, 0],
        }],
      }), { status: 200 })
    }
    return new Response(JSON.stringify([
      { destinationIndex: 0, distanceMeters: 200_000, condition: 'ROUTE_EXISTS', status: {} },
      { destinationIndex: 1, distanceMeters: 320_250, condition: 'ROUTE_EXISTS', status: {} },
    ]), { status: 200 })
  }) as typeof fetch

  try {
    const resultado = await calcularRotaGoogle({
      apiKey: 'teste',
      origem: 'Naviraí, MS, Brasil',
      destino: 'Naviraí, MS, Brasil',
      paradas: [
        { vinculoId: 1, osId: 10, numeroOs: 'OS10', endereco: 'Dourados, MS, Brasil' },
        { vinculoId: 2, osId: 20, numeroOs: 'OS20', endereco: 'Campo Grande, MS, Brasil' },
      ],
    })

    assert.equal(resultado.distanciaKm, 720.45)
    assert.equal(resultado.duracaoMinutos, 480)
    assert.deepEqual(resultado.ordemOtimizada.map((item) => item.osId), [20, 10])
    assert.equal(resultado.distanciasPorVinculo.get(1), 200)
    assert.equal(resultado.distanciasPorVinculo.get(2), 320.25)
  } finally {
    globalThis.fetch = fetchOriginal
  }
})
