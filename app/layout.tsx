import { Geist } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
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
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#1a3a7c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className={`${geist.className} antialiased`}>
        <Script id="hw-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('hw-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;else if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark'}catch(e){}`}
        </Script>
        <AccountingProvider>
          {children}
        </AccountingProvider>
      </body>
    </html>
  )
}
