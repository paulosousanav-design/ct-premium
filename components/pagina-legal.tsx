import Link from 'next/link'
import type { ReactNode } from 'react'

export function PaginaLegal({ titulo, resumo, children }: { titulo: string; resumo: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-black text-blue-700 hover:text-blue-900">← Voltar ao Chame o Técnico</Link>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-blue-600">Chame o Técnico</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">{titulo}</h1>
        <p className="mt-4 leading-7 text-slate-600">{resumo}</p>
        <div className="mt-10 space-y-8 leading-7 [&_a]:font-bold [&_a]:text-blue-700 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-950 [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3">
          {children}
        </div>
        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
          Última atualização: 6 de setembro de 2026.
        </footer>
      </article>
    </main>
  )
}
