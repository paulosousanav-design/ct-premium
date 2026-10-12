'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { HomeHeader } from '@/components/home-header'

const categoriasVisuais = [
  { nome: 'Smart TV', solucao: 'Sem imagem ou sem som' },
  { nome: 'Ar Condicionado', solucao: 'Não climatiza ou não liga' },
  { nome: 'Refrigerador', solucao: 'Não gela ou não forma gelo' },
  { nome: 'Lavadora', solucao: 'Não centrifuga ou não drena' },
  { nome: 'Inversor Solar', solucao: 'Falha de geração ou alarme' },
  { nome: 'Informática', solucao: 'Não liga ou está lento' },
  { nome: 'Outros serviços', solucao: 'Outro equipamento com defeito' },
]

const solucoes = [
  { numero: '01', titulo: 'Diagnóstico no local', texto: 'O técnico avalia o equipamento na sua casa e aponta a causa.' },
  { numero: '02', titulo: 'Reparo em domicílio', texto: 'O conserto acontece no endereço do atendimento.' },
  { numero: '03', titulo: 'Orçamento antes de autorizar', texto: 'Você aprova o valor antes do serviço seguir.' },
  { numero: '04', titulo: 'Peça e mão de obra', texto: 'Quando o reparo pede peça, ela entra no mesmo orçamento.' },
  { numero: '05', titulo: 'Garantia do serviço', texto: 'O reparo executado fica coberto pelo atendimento.' },
  { numero: '06', titulo: 'Acompanhamento da OS', texto: 'Andamento, orçamento e conclusão ficam na sua ordem.' },
]

const marcasAtendidas = [
  { nome: 'LG', src: '/brand-lg-flat.svg' },
  { nome: 'Samsung', src: '/brand-samsung.svg' },
  { nome: 'Electrolux', src: '/brand-electrolux.svg' },
  { nome: 'Brastemp', src: '/brand-brastemp.svg', maior: true },
  { nome: 'Consul', src: '/brand-consul.svg' },
  { nome: 'Panasonic', src: '/brand-panasonic.svg' },
  { nome: 'Philco', src: '/brand-philco.png' },
  { nome: 'Midea', src: '/brand-midea.png', maior: true },
  { nome: 'Carrier', src: '/brand-carrier.svg', maior: true },
  { nome: 'AOC', src: '/brand-aoc.svg' },
  { nome: 'JVC', src: '/brand-jvc.svg' },
  { nome: 'Philips', src: '/brand-philips.svg' },
]

const parcerias = [
  {
    empresa: 'Eletrônica Paulista',
    desde: '1997',
    logos: [{ src: '/brand-lg-flat.svg', alt: 'LG' }],
    seguradoras: [
      { src: '/brand-gazin-seguros.png', alt: 'Gazin Seguros' },
      { src: '/brand-zurich.svg', alt: 'Zurich' },
    ],
  },
  {
    empresa: 'Smart Electro',
    desde: '2019',
    logos: [
      { src: '/brand-tcl.svg', alt: 'TCL' },
      { src: '/brand-intelbras.svg', alt: 'Intelbras' },
      { src: '/brand-sms.png', alt: 'SMS Legrand' },
    ],
  },
]

const passos = [
  { numero: '1', titulo: 'Descreva o problema', texto: 'Conte o que aconteceu com o equipamento.' },
  { numero: '2', titulo: 'Confirme o atendimento', texto: 'A equipe verifica a disponibilidade na sua região.' },
  { numero: '3', titulo: 'Receba a solução', texto: 'O técnico diagnostica no local e apresenta o reparo.' },
  { numero: '4', titulo: 'Aprove e acompanhe', texto: 'Você autoriza o orçamento e segue a OS até o fim.' },
]

export default function Home() {
  const [cookiesAceitos, setCookiesAceitos] = useState<boolean | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCookiesAceitos(window.localStorage.getItem('ct_cookies_aceitos') === 'SIM')
  }, [])

  function aceitarCookies() {
    window.localStorage.setItem('ct_cookies_aceitos', 'SIM')
    setCookiesAceitos(true)
  }

  return (
    <main className="home-page">
      <HomeHeader ativo="inicio" />

      <section className="home-shell hero-grid">
        <div className="hero-card">
          <div className="hero-orbit" />
          <div className="hero-image" />

          <div className="hero-copy">
            <p className="hero-kicker"><i />Suporte conectado</p>
            <h1 className="hero-title">
              Seu equipamento merece <span>cuidado</span> especializado!
            </h1>
            <p>Suporte técnico em domicílio: diagnóstico, solução e acompanhamento da sua OS.</p>

            <div className="check-list">
              <Check text="Diagnóstico no local" />
              <Check text="Orçamento antes do reparo" />
              <Check text="Garantia do serviço" />
              <Check text="Acompanhamento da OS" />
            </div>

            <div className="hero-actions">
              <Link href="/abrir-chamado" className="primary-action">Abrir chamado agora</Link>
              <Link href="/consulta" className="secondary-action">Acompanhar OS</Link>
            </div>

            <div className="stats-row">
              <Stat value="Atendimento em MS" label="Cobertura em expansão" />
              <Stat value="Acompanhe sua OS" label="Tudo online e seguro" />
              <Stat value="Técnicos verificados" label="Parceiros qualificados" />
              <Stat value="30 anos" label="de experiência" />
            </div>
          </div>
        </div>
      </section>

      <section className="brand-band" aria-labelledby="marcas-atendidas">
        <div className="home-shell brand-band-inner">
          <div className="brand-band-copy">
            <span>ASSISTÊNCIA MULTIMARCAS</span>
            <h2 id="marcas-atendidas">Marcas que fazem parte do seu dia a dia</h2>
          </div>
          <ul className="brand-list" aria-label="Marcas atendidas pelo Chame o Técnico">
            {marcasAtendidas.map((marca) => (
              <li key={marca.nome} className={'maior' in marca && marca.maior ? 'logo-maior' : undefined}>
                <img src={marca.src} alt={marca.nome} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-shell parcerias" aria-labelledby="parcerias-autorizadas">
        <div className="parcerias-head">
          <span>Rede de atendimento</span>
          <h2 id="parcerias-autorizadas">Parcerias autorizadas</h2>
        </div>
        <div className="parcerias-grid">
          {parcerias.map((item) => (
            <article key={item.empresa} className="parceria-card">
              <span>Autorizada</span>
              <div className="parceria-titulo">
                <h3>{item.empresa}</h3>
                <p className="parceria-desde">
                  <span>Desde</span>
                  <strong>{item.desde}</strong>
                </p>
              </div>
              <div className="parceria-logos">
                {item.logos.map((logo) => (
                  <img key={logo.alt} src={logo.src} alt={logo.alt} />
                ))}
              </div>
              {('seguradoras' in item) && item.seguradoras && (
                <>
                  <span className="parceria-kicker">Seguradoras</span>
                  <div className="parceria-logos">
                    {item.seguradoras.map((marca) => (
                      'src' in marca
                        ? <img key={marca.alt} src={marca.src} alt={marca.alt} />
                        : <b key={marca.nome}>{marca.nome}</b>
                    ))}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      {cookiesAceitos === false && (
        <div className="cookie-banner">
          <p>Usamos cookies essenciais para melhorar sua navegacao e manter o funcionamento do portal.</p>
          <button type="button" onClick={aceitarCookies}>Aceitar</button>
        </div>
      )}

      {cookiesAceitos === true && (
        <button type="button" onClick={() => setCookiesAceitos(false)} className="cookie-reopen">
          Cookies
        </button>
      )}

      <section className="home-shell">
        <div className="solutions">
          <div className="solutions-head">
            <div>
              <span>Suporte ao cliente</span>
              <h2>A solução chega até você</h2>
            </div>
            <p>Do diagnóstico à conclusão, o atendimento do seu equipamento fica registrado na OS.</p>
          </div>
          <div className="solutions-grid">
            {solucoes.map((item) => (
              <article key={item.numero} className="solution-card">
                <span>{item.numero}</span>
                <h3>{item.titulo}</h3>
                <p>{item.texto}</p>
              </article>
            ))}
          </div>
        </div>

        <h2 className="section-title">O que resolvemos</h2>
        <p className="section-lead">Problemas comuns no equipamento de casa. O suporte começa pelo diagnóstico.</p>
        <div className="categories">
          {categoriasVisuais.map((item) => (
            <div key={item.nome} className="category-card">
              <p>{item.nome}</p>
              <small>{item.solucao}</small>
            </div>
          ))}
        </div>

        <div className="steps-wrap">
          <div className="steps-title">
            <span>Fluxo do atendimento</span>
            <h2>Como funciona?</h2>
          </div>
          <div className="steps">
            {passos.map((passo) => (
              <div key={passo.numero} className="step-card">
                <span className="step-num">{passo.numero}</span>
                <h3>{passo.titulo}</h3>
                <p>{passo.texto}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="home-close">
          <div>
            <span className="close-kicker">Chamado online</span>
            <h2>Pronto para chamar o técnico?</h2>
            <p>Descreva o problema na página do chamado. A equipe confirma o atendimento e segue com você até a solução.</p>
          </div>
          <Link href="/abrir-chamado">Abrir chamado</Link>
        </div>

        <div className="partner">
          <div className="partner-card">
            <div>
              <h2>Você é técnico?<br /><span>Seja um parceiro!</span></h2>
              <p>Receba chamados na sua região e acompanhe seus atendimentos.</p>
            </div>
            <Link href="/cadastro-tecnico">Quero ser parceiro</Link>
          </div>

        </div>

        <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-8 text-sm text-slate-600">
          <span>© 2026 Chame o Técnico</span>
          <nav aria-label="Informações legais" className="flex flex-wrap gap-5 font-bold">
            <Link href="/privacidade" className="hover:text-blue-700">Política de Privacidade</Link>
            <Link href="/termos" className="hover:text-blue-700">Termos de Serviço</Link>
          </nav>
        </footer>
      </section>
    </main>
  )
}

function Check({ text }: { text: string }) {
  return (
    <div className="check-item">
      <i>✓</i>
      <span>{text}</span>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-card">
      <div>
        <div className="stat-number">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}
