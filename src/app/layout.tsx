import localFont from 'next/font/local'
import { Poppins } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

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

export const metadata = {
  title: 'EduBridge Education — Receipt & Billing System',
  description: 'Admissions receipt and fee statement system for EduBridge Education, Dubai, UAE',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${clashGrotesk.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
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
