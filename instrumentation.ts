import type { Instrumentation } from 'next'

export async function register() {
  // Reservado para integrações futuras de métricas e rastreamento distribuído.
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { registrarEventoSistema } = await import('./lib/monitoramento')
  await registrarEventoSistema({
    error,
    modulo: context.routeType === 'route' ? 'API_NAO_TRATADA' : 'RENDERIZACAO',
    origem: context.routeType.toUpperCase(),
    rota: request.path,
    metodo: request.method,
    gravidade: 'CRITICO',
    detalhes: {
      routePath: context.routePath,
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
    request,
  })
}
