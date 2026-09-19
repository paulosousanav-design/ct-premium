import Link from 'next/link'

const recursos = [
  ['OS inteligente', 'Do orçamento à entrega, acompanhe cada atendimento com clareza.'],
  ['Estoque integrado', 'Peças, fornecedores e movimentações organizados na mesma operação.'],
  ['Financeiro real', 'Recebimentos, pagamentos, caixa e visão gerencial em um só lugar.'],
  ['Equipe conectada', 'Técnicos, permissões e rotinas organizados por empresa.'],
]

const planos = [
  { nome: 'Essencial', valor: 'R$ 79', detalhe: 'Para começar com organização', itens: ['1 empresa', 'Ordens de serviço', 'Clientes e estoque', 'Financeiro básico'] },
  { nome: 'Profissional', valor: 'R$ 129', detalhe: 'Para uma operação em crescimento', itens: ['Tudo do Essencial', 'Gestão de equipe', 'Financeiro avançado', 'Relatórios gerenciais'], destaque: true },
  { nome: 'Completo', valor: 'R$ 179', detalhe: 'Para gestão completa e expansão', itens: ['Tudo do Profissional', 'Empresas do grupo', 'DRE gerencial', 'Recursos completos'] },
]

const whatsapp = 'https://wa.me/5567992058808?text=Olá!%20Quero%20conhecer%20o%20P4%20Integra.'

export default function P4IntegraPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <section className="relative isolate border-b border-white/10 bg-[radial-gradient(circle_at_72%_18%,#1c5de8_0,transparent_28%),radial-gradient(circle_at_20%_80%,#0ea5a4_0,transparent_34%),#07111f]">
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-6 lg:px-8 lg:pb-28">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3" aria-label="P4 Integra, início">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-600 text-lg font-black text-slate-950 shadow-lg shadow-cyan-500/20">P4</span>
              <span className="text-xl font-black tracking-tight">Integra</span>
            </Link>
            <div className="flex items-center gap-3">
              <a href="#planos" className="hidden text-sm font-bold text-slate-300 transition hover:text-white sm:block">Planos</a>
              <a href="https://app.p4integra.com.br/admin/login" className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-black transition hover:bg-white/10">Acessar sistema</a>
            </div>
          </nav>

          <div className="grid items-center gap-12 pt-20 lg:grid-cols-[1.04fr_.96fr]">
            <div>
              <p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.18em] text-cyan-200">Gestão para assistência técnica</p>
              <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-6xl lg:text-7xl">A operação da sua oficina, <span className="bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">integrada.</span></h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">O P4 Integra reúne ordens de serviço, equipe, peças, estoque e financeiro para você ter controle real do negócio.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-500 px-6 py-4 text-center text-sm font-black text-slate-950 shadow-xl shadow-blue-500/25 transition hover:-translate-y-0.5">Quero conhecer o sistema</a>
                <a href="#recursos" className="rounded-2xl border border-white/20 px-6 py-4 text-center text-sm font-black text-white transition hover:bg-white/10">Ver recursos</a>
              </div>
              <p className="mt-5 text-sm font-semibold text-slate-400">Feito para oficinas e assistências técnicas que querem crescer com organização.</p>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-cyan-300/20 to-blue-600/30 blur-2xl" />
              <div className="relative rounded-[2rem] border border-white/15 bg-slate-950/70 p-4 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-4"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" /><i className="h-2.5 w-2.5 rounded-full bg-amber-300" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="ml-3 text-xs font-bold text-slate-500">Visão da operação</span></div>
                <div className="grid gap-3 p-2 pt-5 sm:grid-cols-2">
                  <Metric label="Ordens em andamento" value="24" color="text-cyan-300" />
                  <Metric label="Recebimentos do mês" value="R$ 18,4 mil" color="text-emerald-300" />
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Operação organizada</p><div className="mt-4 space-y-3"><Linha label="Ordens de serviço" value="86%" /><Linha label="Estoque controlado" value="72%" /><Linha label="Financeiro conciliado" value="91%" /></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="recursos" className="bg-slate-50 px-6 py-20 text-slate-950 lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">Tudo conectado</p><h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">Menos retrabalho. Mais controle.</h2><div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{recursos.map(([titulo, descricao], index) => <article key={titulo} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-sm font-black text-blue-700">0{index + 1}</span><h3 className="mt-6 text-xl font-black">{titulo}</h3><p className="mt-3 text-sm leading-relaxed text-slate-600">{descricao}</p></article>)}</div></div></section>

      <section id="planos" className="bg-[#eef5ff] px-6 py-20 text-slate-950 lg:px-8"><div className="mx-auto max-w-7xl"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">Planos diretos</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Escolha o ritmo da sua oficina.</h2><p className="mx-auto mt-4 max-w-2xl text-slate-600">Sem complicação: comece no plano que faz sentido hoje e evolua quando precisar.</p></div><div className="mt-12 grid gap-5 lg:grid-cols-3">{planos.map((plano) => <article key={plano.nome} className={`relative rounded-3xl p-7 ${plano.destaque ? 'bg-slate-950 text-white shadow-2xl shadow-blue-900/20 ring-2 ring-cyan-300' : 'bg-white shadow-sm'}`}>{plano.destaque && <span className="absolute -top-3 left-7 rounded-full bg-cyan-300 px-3 py-1 text-xs font-black text-slate-950">Mais escolhido</span>}<p className={`text-sm font-black ${plano.destaque ? 'text-cyan-300' : 'text-blue-700'}`}>{plano.nome}</p><p className="mt-4 text-4xl font-black">{plano.valor}<span className={`text-sm font-bold ${plano.destaque ? 'text-slate-400' : 'text-slate-500'}`}>/mês</span></p><p className={`mt-3 text-sm ${plano.destaque ? 'text-slate-300' : 'text-slate-600'}`}>{plano.detalhe}</p><ul className="mt-7 space-y-3">{plano.itens.map((item) => <li key={item} className={`flex gap-3 text-sm font-semibold ${plano.destaque ? 'text-slate-200' : 'text-slate-700'}`}><span className="text-cyan-400">✓</span>{item}</li>)}</ul><a href={whatsapp} target="_blank" rel="noreferrer" className={`mt-8 block rounded-xl px-4 py-3 text-center text-sm font-black transition ${plano.destaque ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>Conversar sobre este plano</a></article>)}</div><p className="mt-6 text-center text-sm text-slate-500">Pagamento mensal ou semestral antecipado com condição especial.</p></div></section>

      <section className="px-6 py-20 lg:px-8"><div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-gradient-to-r from-blue-700 to-cyan-600 p-8 text-center shadow-2xl sm:p-14"><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-100">P4 Integra</p><h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">Sua oficina merece uma gestão à altura do seu trabalho.</h2><p className="mx-auto mt-5 max-w-2xl text-slate-100">Conheça o sistema, tire suas dúvidas e comece com o plano ideal para sua operação.</p><a href={whatsapp} target="_blank" rel="noreferrer" className="mt-8 inline-block rounded-2xl bg-white px-6 py-4 text-sm font-black text-blue-800 transition hover:bg-slate-100">Falar pelo WhatsApp</a></div></section>
      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-slate-400">© {new Date().getFullYear()} P4 Integra. Gestão para assistência técnica e oficinas.</footer>
    </main>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className={`mt-2 text-2xl font-black ${color}`}>{value}</p></div> }
function Linha({ label, value }: { label: string; value: string }) { return <div><div className="flex justify-between text-xs font-bold text-slate-300"><span>{label}</span><span>{value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500" style={{ width: value }} /></div></div> }
