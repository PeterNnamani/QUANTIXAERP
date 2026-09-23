import { Geist } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import './dashboard-styles.css'
import { AccountingProvider } from '@/lib/context'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QUANTIXA — Intelligent ERP',
  description: 'QUANTIXA AI-powered enterprise dashboard',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  fit: 'cover',
  themeColor: '#1a3a7c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${geist.className} antialiased`}>
        <AccountingProvider>
          {children}
        </AccountingProvider>
      </body>
    </html>
  )
}
