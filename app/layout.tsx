import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CT Premium',
  description: 'Chame o Técnico - Assistência Premium',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}