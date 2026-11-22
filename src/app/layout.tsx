import localFont from 'next/font/local'
import { Poppins } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { OfflineBanner } from '@/components/OfflineBanner'
import type { Metadata, Viewport } from 'next'

export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-poppins',
  display: 'swap',
})

export const clashGrotesk = localFont({
  src: [
    {
      path: '../../public/fonts/ClashGrotesk-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ClashGrotesk-Semibold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-clash',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#00A57E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'EduBridge Education — Receipt & Billing System',
  description: 'Admissions receipt and fee statement system for EduBridge Education, Dubai, UAE',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EduBridge Receipts',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${clashGrotesk.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <OfflineBanner />
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            style: {
              borderRadius: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
