import React from 'react'
import { cn } from '@/lib/utils'

interface CandidateAvatarProps {
  name: string
  code?: string | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

// Brand-coherent color combinations
const AVATAR_COLOR_PALETTES = [
  { bg: 'bg-[#E6F6F2]', text: 'text-[#00805F]', border: 'border-[#CCEDE5]' },
  { bg: 'bg-[#E0F2FE]', text: 'text-[#0369A1]', border: 'border-[#BAE6FD]' },
  { bg: 'bg-[#EDE9FE]', text: 'text-[#6D28D9]', border: 'border-[#DDD6FE]' },
  { bg: 'bg-[#FEF3C7]', text: 'text-[#B45309]', border: 'border-[#FDE68A]' },
  { bg: 'bg-[#FCE7F3]', text: 'text-[#BE185D]', border: 'border-[#FBCFE8]' },
  { bg: 'bg-[#F3E8FF]', text: 'text-[#7E22CE]', border: 'border-[#E9D5FF]' },
  { bg: 'bg-[#CCFBF1]', text: 'text-[#0F766E]', border: 'border-[#99F6E4]' },
  { bg: 'bg-[#FFEDD5]', text: 'text-[#C2410C]', border: 'border-[#FED7AA]' },
]

export function getInitials(name: string): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function CandidateAvatar({
  name,
  code,
  className,
  size = 'md',
}: CandidateAvatarProps) {
  const initials = getInitials(name)

  // Deterministic color selection from name or code
  const key = (code || name || 'default').toLowerCase()
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  const paletteIndex = Math.abs(hash) % AVATAR_COLOR_PALETTES.length
  const palette = AVATAR_COLOR_PALETTES[paletteIndex]

  const sizeStyles =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-10 h-10 text-sm'

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-full border shrink-0 select-none tracking-tight',
        palette.bg,
        palette.text,
        palette.border,
        sizeStyles,
        className
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}
