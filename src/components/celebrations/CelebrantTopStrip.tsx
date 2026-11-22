'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import type { CelebrationPerson } from './actions'

interface CelebrantTopStripProps {
  celebration?: CelebrationPerson | null
}

export function CelebrantTopStrip({ celebration }: CelebrantTopStripProps) {
  const pathname = usePathname()

  // Pages that must NEVER be themed
  if (
    !celebration ||
    pathname.startsWith('/receipts') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/u/') ||
    pathname === '/login' ||
    pathname === '/reset-password'
  ) {
    return null
  }

  const isBirthday = celebration.kind === 'birthday'

  return (
    <div
      data-testid="celebrant-top-strip"
      className="w-full h-1.5 shrink-0 transition-all duration-300 relative overflow-hidden"
      style={{
        background: isBirthday
          ? 'linear-gradient(90deg, #00A57E 0%, #00805F 35%, #F5C451 70%, #00A57E 100%)'
          : 'linear-gradient(90deg, #00A57E 0%, #00805F 40%, #D4AF37 75%, #00A57E 100%)',
      }}
      aria-hidden="true"
    />
  )
}
