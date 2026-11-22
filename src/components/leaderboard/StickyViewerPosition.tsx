'use client'

import React from 'react'
import Image from 'next/image'
import type { LeaderboardEntry, LeaderboardMetric } from '@/app/(app)/leaderboard/actions'
import { cn } from '@/lib/utils'

interface StickyViewerPositionProps {
  viewerEntry: LeaderboardEntry | null
  metric: LeaderboardMetric
}

export function StickyViewerPosition({
  viewerEntry,
  metric,
}: StickyViewerPositionProps) {
  if (!viewerEntry) return null

  return (
    <div className="fixed bottom-18 lg:bottom-6 right-4 sm:right-8 z-20 max-w-sm w-[calc(100%-2rem)]">
      <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#0A0A0A] text-white shadow-xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          {/* Rank Badge */}
          <div className="w-9 h-9 rounded-xl bg-[#00A57E] text-white flex items-center justify-center font-bold text-sm shrink-0">
            #{viewerEntry.rank}
          </div>

          {/* User Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate">Your Position</span>
              {viewerEntry.rank_delta !== null && viewerEntry.rank_delta !== 0 && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1 rounded',
                    viewerEntry.rank_delta > 0
                      ? 'text-[#00A57E] bg-[#00A57E]/20'
                      : 'text-[#F87171] bg-[#F87171]/20'
                  )}
                >
                  {viewerEntry.rank_delta > 0 ? `▲${viewerEntry.rank_delta}` : `▼${Math.abs(viewerEntry.rank_delta)}`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#A3A3A3] truncate">
              {metric === 'collections' ? (
                viewerEntry.collections_amount !== null ? (
                  <span className="tabular-nums">
                    AED{' '}
                    {viewerEntry.collections_amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                ) : (
                  <span>Collections: Hidden</span>
                )
              ) : (
                <span className="tabular-nums">
                  {viewerEntry.admissions_count} {viewerEntry.admissions_count === 1 ? 'admission' : 'admissions'}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#00A57E] text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden ml-2 ring-1 ring-white/20">
          {viewerEntry.avatar_url ? (
            <Image
              src={viewerEntry.avatar_url}
              alt={viewerEntry.full_name}
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          ) : (
            viewerEntry.full_name.charAt(0) || 'U'
          )}
        </div>
      </div>
    </div>
  )
}
