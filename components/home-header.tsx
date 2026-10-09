import Image from 'next/image'
import Link from 'next/link'

type Item = 'inicio' | 'chamado' | 'consulta' | 'parceiro'

const links: { id: Item; href: string; label: string }[] = [
  { id: 'inicio', href: '/', label: 'Inicio' },
  { id: 'chamado', href: '/abrir-chamado', label: 'Abrir Chamado' },
  { id: 'consulta', href: '/consulta', label: 'Acompanhar OS' },
  { id: 'parceiro', href: '/cadastro-tecnico', label: 'Seja Parceiro' },
]

export function HomeHeader({ ativo }: { ativo: Item }) {
  return (
    <header className="home-shell home-header">
      <Link href="/" aria-label="Chame o Tecnico">
        <Image src="/logo-chame-o-tecnico.png" alt="Chame o Tecnico" width={360} height={95} className="home-logo h-auto w-[260px]" priority />
      </Link>

      <nav className="home-nav">
        {links.map((item) => (
          <Link key={item.id} href={item.href} className={item.id === ativo ? 'active' : undefined}>
            {item.label}
          </Link>
        ))}
        <Link href="/abrir-chamado" className="top-cta">Abrir chamado</Link>
      </nav>
    </header>
  )
}
