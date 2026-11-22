'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users, AlertCircle, TrendingUp, CheckCircle2 } from 'lucide-react'
import { formatAED } from '@/lib/money'
import { cn } from '@/lib/utils'

export interface CandidateDirectoryKpis {
  total_candidates: number
  outstanding_balance: number
  collected_this_month: number
  fully_paid_count: number
  balance_due_count: number
  overdue_count: number
  no_enrollment_count: number
}

interface CandidatesKpiStripProps {
  kpis: CandidateDirectoryKpis
  activeStatus?: string
}

export function CandidatesKpiStrip({ kpis, activeStatus = 'all' }: CandidatesKpiStripProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleCardClick = (targetStatus: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (targetStatus === 'all') {
      params.delete('status')
    } else {
      params.set('status', targetStatus)
    }
    params.set('page', '1')
    router.push(`/candidates?${params.toString()}`)
  }

  const cards = [
    {
      id: 'all',
      title: 'Total candidates',
      value: kpis.total_candidates.toLocaleString(),
      subtext: `${kpis.balance_due_count + kpis.overdue_count} with active balance`,
      icon: Users,
      iconColor: 'text-[#00A57E]',
      iconBg: 'bg-[#E6F6F2]',
      targetStatus: 'all',
      isSelected: activeStatus === 'all' || !activeStatus,
    },
    {
      id: 'balance_due',
      title: 'Outstanding balance',
      value: formatAED(kpis.outstanding_balance),
      subtext: `${kpis.overdue_count} overdue candidates`,
      icon: AlertCircle,
      iconColor: 'text-[#B45309]',
      iconBg: 'bg-[#FEF3C7]',
      targetStatus: 'balance_due',
      isSelected: activeStatus === 'balance_due',
    },
    {
      id: 'month_collected',
      title: 'Collected this month',
      value: formatAED(kpis.collected_this_month),
      subtext: 'Receipts issued in Dubai timezone',
      icon: TrendingUp,
      iconColor: 'text-[#00805F]',
      iconBg: 'bg-[#E6F6F2]',
      targetStatus: 'all',
      isSelected: false,
    },
    {
      id: 'fully_paid',
      title: 'Fully paid',
      value: kpis.fully_paid_count.toLocaleString(),
      subtext: 'Zero balance remaining',
      icon: CheckCircle2,
      iconColor: 'text-[#00A57E]',
      iconBg: 'bg-[#E6F6F2]',
      targetStatus: 'fully_paid',
      isSelected: activeStatus === 'fully_paid',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => handleCardClick(card.targetStatus)}
            className={cn(
              'flex flex-col text-left p-4 rounded-[14px] bg-white border transition-all text-[#0A0A0A]',
              card.isSelected
                ? 'border-[#00A57E] ring-2 ring-[#00A57E]/15 shadow-sm'
                : 'border-[#E4E7E7] hover:border-[#00A57E]/40 hover:shadow-xs hover:bg-[#F5F6F6]/40'
            )}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <span className="text-xs font-semibold text-[#6B7272] tracking-wide uppercase">
                {card.title}
              </span>
              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', card.iconBg)}>
                <Icon className={cn('w-4 h-4', card.iconColor)} />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#0A0A0A] tabular-nums tracking-tight">
              {card.value}
            </div>
            <span className="text-xs text-[#6B7272] font-medium mt-1 truncate">
              {card.subtext}
            </span>
          </button>
        )
      })}
    </div>
  )
}
