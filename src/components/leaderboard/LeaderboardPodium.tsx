'use client'

import React from 'react'
import Image from 'next/image'
import { Trophy, Award, Medal } from 'lucide-react'
import type { LeaderboardEntry, LeaderboardMetric } from '@/app/(app)/leaderboard/actions'
import { cn } from '@/lib/utils'

interface LeaderboardPodiumProps {
  topThree: LeaderboardEntry[]
  metric: LeaderboardMetric
}

export function LeaderboardPodium({ topThree, metric }: LeaderboardPodiumProps) {
  if (topThree.length === 0) return null

  // Reorder for podium presentation: [2nd (left), 1st (center/elevated), 3rd (right)]
  const first = topThree.find((e) => e.rank === 1) || topThree[0]
  const second = topThree.find((e) => e.rank === 2) || (topThree.length > 1 ? topThree[1] : null)
  const third = topThree.find((e) => e.rank === 3) || (topThree.length > 2 ? topThree[2] : null)

  const renderMetricValue = (entry: LeaderboardEntry) => {
    if (metric === 'collections') {
      if (entry.collections_amount === null) {
        return <span className="text-xs text-[#6B7272] italic">Hidden</span>
      }
      return (
        <span className="tabular-nums font-bold text-foreground">
          AED {entry.collections_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    }
    return (
      <span className="tabular-nums font-bold text-foreground">
        {entry.admissions_count} {entry.admissions_count === 1 ? 'admission' : 'admissions'}
      </span>
    )
  }

  const renderPodiumCard = (
    entry: LeaderboardEntry | null,
    rank: 1 | 2 | 3,
    heightClass: string
  ) => {
    if (!entry) {
      return (
        <div
          className={cn(
            'flex-1 flex flex-col items-center justify-end p-4 rounded-2xl border border-dashed border-[#E4E7E7] bg-white/50 opacity-60',
            heightClass
          )}
        >
          <span className="text-xs text-[#6B7272]">#{rank}</span>
        </div>
      )
    }

    const rankConfig = {
      1: {
        badgeBg: 'bg-[#FEF08A] text-[#854D0E] border-[#FACC15]',
        ringColor: 'ring-4 ring-[#FACC15]/40 border-2 border-[#EAB308]',
        crown: '👑',
        label: '1st',
        icon: Trophy,
      },
      2: {
        badgeBg: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
        ringColor: 'ring-3 ring-[#94A3B8]/30 border-2 border-[#94A3B8]',
        crown: '🥈',
        label: '2nd',
        icon: Medal,
      },
      3: {
        badgeBg: 'bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]',
        ringColor: 'ring-3 ring-[#F97316]/30 border-2 border-[#EA580C]',
        crown: '🥉',
        label: '3rd',
        icon: Award,
      },
    }[rank]

    return (
      <div
        className={cn(
          'flex-1 flex flex-col items-center justify-between p-4 sm:p-5 rounded-2xl border bg-white shadow-xs transition-all relative',
          rank === 1
            ? 'border-[#00A57E] shadow-md shadow-[#00A57E]/10 z-10 sm:-translate-y-2'
            : 'border-[#E4E7E7]',
          entry.is_self && 'ring-2 ring-[#00A57E]/60 bg-[#E6F6F2]/30',
          heightClass
        )}
      >
        {/* Rank Badge Header */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs inline-flex items-center gap-1',
              rankConfig.badgeBg
            )}
          >
            <span>{rankConfig.crown}</span>
            <span>{rankConfig.label}</span>
          </span>
          {entry.is_self && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F6F2] text-[#00805F] border border-[#00A57E]/20">
              You
            </span>
          )}
        </div>

        {/* Staff Avatar with Rank Ring */}
        <div className="my-3 flex flex-col items-center">
          <div
            className={cn(
              'relative rounded-full flex items-center justify-center font-bold text-white shrink-0 bg-[#00A57E] overflow-hidden',
              rank === 1 ? 'w-16 h-16 sm:w-20 sm:h-20 text-xl' : 'w-13 h-13 sm:w-16 sm:h-16 text-lg',
              rankConfig.ringColor
            )}
          >
            {entry.avatar_url ? (
              <Image
                src={entry.avatar_url}
                alt={entry.full_name}
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            ) : (
              entry.full_name.charAt(0) || 'U'
            )}
          </div>

          <h3 className="mt-2.5 text-xs sm:text-sm font-bold text-center text-[#0A0A0A] line-clamp-1 max-w-[120px] sm:max-w-[150px]">
            {entry.full_name}
          </h3>
          {entry.job_title && (
            <p className="text-[10px] sm:text-[11px] text-[#6B7272] text-center line-clamp-1 max-w-[120px] sm:max-w-[150px]">
              {entry.job_title}
            </p>
          )}
        </div>

        {/* Metric Score Box */}
        <div className="w-full text-center pt-2 border-t border-[#E4E7E7]/60">
          <div className="text-xs sm:text-sm">{renderMetricValue(entry)}</div>
          {entry.rank_delta !== null && entry.rank_delta !== 0 && (
            <div
              className={cn(
                'text-[10px] font-semibold mt-0.5 inline-flex items-center gap-0.5',
                entry.rank_delta > 0 ? 'text-[#00805F]' : 'text-[#C53030]'
              )}
            >
              {entry.rank_delta > 0 ? `▲ ${entry.rank_delta}` : `▼ ${Math.abs(entry.rank_delta)}`}
              <span className="text-[#6B7272] font-normal text-[9px]">vs prev</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto my-4 sm:my-6">
      <div className="flex items-end justify-center gap-2 sm:gap-4 px-1">
        {/* 2nd Place (Left) */}
        {renderPodiumCard(second, 2, 'min-h-[220px] sm:min-h-[240px]')}

        {/* 1st Place (Center / Elevated) */}
        {renderPodiumCard(first, 1, 'min-h-[250px] sm:min-h-[270px]')}

        {/* 3rd Place (Right) */}
        {renderPodiumCard(third, 3, 'min-h-[210px] sm:min-h-[230px]')}
      </div>
    </div>
  )
}
