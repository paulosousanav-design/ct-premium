import Image from 'next/image'
import Link from 'next/link'

type BrandLogoProps = {
  variant?: 'light' | 'dark'
  showDomain?: boolean
}

export function BrandLogo({ variant = 'light', showDomain = true }: BrandLogoProps) {
  const isDark = variant === 'dark'

  return (
    <Link href="/admin/dashboard" className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
        <Image
          src="/logo-ct.png"
          alt="Chame o Técnico"
          width={48}
          height={48}
          className="h-full w-full object-contain"
          priority
        />
      </div>

      <div className="leading-tight">
        <p className={isDark ? 'text-base font-bold text-white' : 'text-base font-bold text-slate-900'}>
          CT Premium
        </p>
        <p className={isDark ? 'text-xs text-slate-300' : 'text-xs text-slate-500'}>
          Assistência Premium
        </p>
        {showDomain && (
          <p className="text-[11px] text-slate-400">
            www.chameotecnico.com.br
          </p>
        )}
      </div>
    </Link>
  )
}