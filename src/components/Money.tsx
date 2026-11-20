import React from 'react'
import { cn } from '@/lib/utils'

interface MoneyProps {
  amount: number | string | null | undefined
  className?: string
  showCurrency?: boolean
}

export function formatAED(val: number | string | null | undefined): string {
  const num = typeof val === 'string' ? parseFloat(val) : (val ?? 0)
  if (isNaN(num)) return 'AED 0.00'
  return `AED ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function Money({ amount, className, showCurrency = true }: MoneyProps) {
  const formatted = formatAED(amount)
  const display = showCurrency ? formatted : formatted.replace('AED ', '')

  return (
    <span className={cn('tabular-nums font-medium', className)}>
      {display}
    </span>
  )
}
