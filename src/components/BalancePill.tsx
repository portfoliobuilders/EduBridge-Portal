import React from 'react'
import { cn } from '@/lib/utils'
import { formatAED } from './Money'

export type CandidateStatus = 'No enrollment' | 'Balance due' | 'Overdue' | 'Fully paid' | string

interface BalancePillProps {
  balance?: number | string | null
  status?: CandidateStatus | null
  className?: string
}

export function BalancePill({ balance, status, className }: BalancePillProps) {
  const num = typeof balance === 'string' ? parseFloat(balance) : (balance ?? 0)

  // Explicit status handling
  if (status === 'No enrollment') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F5F6F6] text-[#6B7272] border border-[#E4E7E7]',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#A1A7A7]" />
        No enrollment
      </span>
    )
  }

  if (status === 'Overdue') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#C53030] border border-[#FECACA] tabular-nums',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#C53030]" />
        Overdue: {formatAED(num)}
      </span>
    )
  }

  if (status === 'Balance due' || (status == null && num > 0)) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] tabular-nums',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#B7791F]" />
        Due: {formatAED(num)}
      </span>
    )
  }

  // Fully paid
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5] tabular-nums',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#00A57E]" />
      Fully paid
    </span>
  )
}
