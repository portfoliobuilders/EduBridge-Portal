import React from 'react'
import { cn } from '@/lib/utils'

export type StatusType =
  | 'valid'
  | 'void'
  | 'active'
  | 'completed'
  | 'cancelled'

interface StatusBadgeProps {
  status: StatusType | string
  className?: string
}

const statusConfig: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  valid: {
    label: 'Valid',
    bg: 'bg-[#E6F6F2]',
    text: 'text-[#00805F]',
    border: 'border-[#CCEDE5]',
  },
  active: {
    label: 'Active',
    bg: 'bg-[#E6F6F2]',
    text: 'text-[#00805F]',
    border: 'border-[#CCEDE5]',
  },
  void: {
    label: 'VOID',
    bg: 'bg-[#FDF2F2]',
    text: 'text-[#C53030]',
    border: 'border-[#F8B4B4]',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-[#FDF2F2]',
    text: 'text-[#C53030]',
    border: 'border-[#F8B4B4]',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status?.toLowerCase()
  const conf = statusConfig[key] || {
    label: status,
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border',
        conf.bg,
        conf.text,
        conf.border,
        className
      )}
    >
      {conf.label}
    </span>
  )
}
