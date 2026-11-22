'use client'

import React from 'react'
import Image from 'next/image'
import type { LeaderboardEntry, LeaderboardMetric } from '@/app/(app)/leaderboard/actions'
import { cn } from '@/lib/utils'

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  metric: LeaderboardMetric
}

export function LeaderboardTable({ entries, metric }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="w-full text-center py-12 px-4 rounded-2xl border border-dashed border-[#E4E7E7] bg-white">
        <p className="text-sm font-medium text-[#6B7272]">No leaderboard records found for this period.</p>
      </div>
    )
  }

  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#FEF08A] text-[#854D0E] font-bold text-xs border border-[#FACC15]">
          1
        </span>
      )
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#F1F5F9] text-[#475569] font-bold text-xs border border-[#CBD5E1]">
          2
        </span>
      )
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#FFEDD5] text-[#9A3412] font-bold text-xs border border-[#FDBA74]">
          3
        </span>
      )
    }
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[#6B7272] font-semibold text-xs tabular-nums">
        {rank}
      </span>
    )
  }

  const renderRankDelta = (delta: number | null) => {
    if (delta === null || delta === 0) {
      return <span className="text-[#6B7272] text-xs font-medium">—</span>
    }
    if (delta > 0) {
      return (
        <span className="text-[#00805F] text-xs font-semibold inline-flex items-center gap-0.5">
          ▲{delta}
        </span>
      )
    }
    return (
      <span className="text-[#C53030] text-xs font-semibold inline-flex items-center gap-0.5">
        ▼{Math.abs(delta)}
      </span>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#E4E7E7] bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-[#E4E7E7] bg-[#F5F6F6] text-xs font-semibold text-[#6B7272]">
              <th scope="col" className="py-3.5 pl-4 sm:pl-6 pr-2 w-16 text-center">
                Rank
              </th>
              <th scope="col" className="py-3.5 px-3">
                Counsellor
              </th>
              <th scope="col" className="py-3.5 px-3 text-right">
                Admissions
              </th>
              <th scope="col" className="py-3.5 px-3 text-right">
                Collections
              </th>
              <th scope="col" className="py-3.5 pl-3 pr-4 sm:pr-6 text-center w-24">
                Trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E7E7]">
            {entries.map((entry) => {
              const isHighlightMetricAdmissions = metric === 'admissions'
              const isHighlightMetricCollections = metric === 'collections'

              return (
                <tr
                  key={entry.user_id}
                  className={cn(
                    'transition-colors hover:bg-[#F5F6F6]/60',
                    entry.is_self && 'bg-[#E6F6F2]/40 font-medium'
                  )}
                >
                  {/* 1. Rank */}
                  <td className="py-3.5 pl-4 sm:pl-6 pr-2 text-center whitespace-nowrap">
                    {renderRankBadge(entry.rank)}
                  </td>

                  {/* 2. Staff Profile & Job Title */}
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#00A57E] text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden relative ring-1 ring-[#E4E7E7]">
                        {entry.avatar_url ? (
                          <Image
                            src={entry.avatar_url}
                            alt={entry.full_name}
                            width={36}
                            height={36}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          entry.full_name.charAt(0) || 'U'
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#0A0A0A] truncate">
                            {entry.full_name}
                          </span>
                          {entry.is_self && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#00A57E] text-white">
                              You
                            </span>
                          )}
                        </div>
                        {entry.job_title && (
                          <p className="text-xs text-[#6B7272] truncate">{entry.job_title}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 3. Admissions */}
                  <td
                    className={cn(
                      'py-3.5 px-3 text-right tabular-nums whitespace-nowrap',
                      isHighlightMetricAdmissions ? 'font-bold text-[#0A0A0A]' : 'text-[#6B7272]'
                    )}
                  >
                    {entry.admissions_count}
                  </td>

                  {/* 4. Collections */}
                  <td
                    className={cn(
                      'py-3.5 px-3 text-right tabular-nums whitespace-nowrap',
                      isHighlightMetricCollections ? 'font-bold text-[#0A0A0A]' : 'text-[#6B7272]'
                    )}
                  >
                    {entry.collections_amount !== null ? (
                      `AED ${entry.collections_amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    ) : (
                      <span className="text-[#6B7272] italic text-xs">Hidden</span>
                    )}
                  </td>

                  {/* 5. Rank Delta (vs previous period) */}
                  <td className="py-3.5 pl-3 pr-4 sm:pr-6 text-center tabular-nums whitespace-nowrap">
                    {renderRankDelta(entry.rank_delta)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
