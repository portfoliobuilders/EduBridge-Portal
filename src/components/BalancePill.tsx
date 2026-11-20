import React from 'react'
import { cn } from '@/lib/utils'
import { formatAED } from './Money'

interface BalancePillProps {
  balance: number | string | null | undefined
  className?: string
}

export function BalancePill({ balance, className }: BalancePillProps) {
  const num = typeof balance === 'string' ? parseFloat(balance) : (balance ?? 0)

  if (num <= 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5] tabular-nums',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#00A57E]" />
        Fully Paid
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] tabular-nums',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#B7791F]" />
      Due: {formatAED(num)}
    </span>
  )
}
