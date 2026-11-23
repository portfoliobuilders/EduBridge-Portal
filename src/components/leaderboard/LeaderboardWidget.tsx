'use client'

import React, { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Trophy, ChevronRight } from 'lucide-react'
import { getLeaderboardAction, type LeaderboardEntry, type LeaderboardMetric } from '@/app/(app)/leaderboard/actions'
import { cn } from '@/lib/utils'

export function LeaderboardWidget() {
  const [metric, setMetric] = useState<LeaderboardMetric>('admissions')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [isPending, startTransition] = useTransition()
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = (m: LeaderboardMetric) => {
    setError(null)
    getLeaderboardAction({ period: 'this_month', metric: m })
      .then((res) => {
        if (res.error) {
          setError(res.error)
        } else {
          setEntries(res.data.slice(0, 3))
        }
        setInitialLoaded(true)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load top performers')
        setInitialLoaded(true)
      })
  }

  useEffect(() => {
    let ignore = false
    void Promise.resolve().then(() => {
      if (!ignore) {
        loadData('admissions')
      }
    })
    return () => {
      ignore = true
    }
  }, [])

  const handleMetricToggle = (newMetric: LeaderboardMetric) => {
    setMetric(newMetric)
    startTransition(async () => {
      setError(null)
      const res = await getLeaderboardAction({ period: 'this_month', metric: newMetric })
      if (res.error) {
        setError(res.error)
      } else {
        setEntries(res.data.slice(0, 3))
      }
    })
  }

  const rankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="w-6 h-6 rounded-full bg-[#FEF08A] text-[#854D0E] flex items-center justify-center text-xs font-bold border border-[#FACC15] shrink-0">
          🥇
        </span>
      )
    }
    if (rank === 2) {
      return (
        <span className="w-6 h-6 rounded-full bg-[#F1F5F9] text-[#475569] flex items-center justify-center text-xs font-bold border border-[#CBD5E1] shrink-0">
          🥈
        </span>
      )
    }
    return (
      <span className="w-6 h-6 rounded-full bg-[#FFEDD5] text-[#9A3412] flex items-center justify-center text-xs font-bold border border-[#FDBA74] shrink-0">
        🥉
      </span>
    )
  }

  return (
    <div className="rounded-2xl border border-[#E4E7E7] bg-white p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E4E7E7]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E6F6F2] text-[#00A57E] flex items-center justify-center">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0A0A0A]">Top 3 This Month</h3>
            <p className="text-[11px] text-[#6B7272]">Live staff standings</p>
          </div>
        </div>

        {/* Metric Toggle */}
        <div className="inline-flex rounded-xl bg-[#F5F6F6] p-0.5 border border-[#E4E7E7]">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleMetricToggle('admissions')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
              metric === 'admissions'
                ? 'bg-white text-[#00805F] shadow-2xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            Admissions
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleMetricToggle('collections')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
              metric === 'collections'
                ? 'bg-white text-[#00805F] shadow-2xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            Collections
          </button>
        </div>
      </div>

      {/* Body: Top 3 List */}
      <div className={cn('py-2 divide-y divide-[#E4E7E7]/40 min-h-[140px] flex flex-col justify-center transition-opacity', isPending && 'opacity-60')}>
        {!initialLoaded ? (
          <div className="py-6 text-center text-xs text-[#6B7272]">Loading top performers...</div>
        ) : error ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-xs text-red-600">Couldn&apos;t load top performers</p>
            <button
              type="button"
              onClick={() => loadData(metric)}
              className="text-[11px] font-semibold text-[#00805F] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#6B7272]">No records yet this month</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.user_id} className="flex items-center justify-between py-2.5 px-1">
              <div className="flex items-center gap-3 min-w-0">
                {rankBadge(entry.rank)}
                <div className="w-8 h-8 rounded-full bg-[#00A57E] text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden relative">
                  {entry.avatar_url ? (
                    <Image
                      src={entry.avatar_url}
                      alt={entry.full_name}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    entry.full_name.charAt(0) || 'U'
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#0A0A0A] truncate">
                    {entry.full_name}
                    {entry.is_self && (
                      <span className="ml-1.5 px-1 py-0.2 rounded text-[9px] bg-[#E6F6F2] text-[#00805F]">
                        You
                      </span>
                    )}
                  </p>
                  {entry.job_title && (
                    <p className="text-[10px] text-[#6B7272] truncate">{entry.job_title}</p>
                  )}
                </div>
              </div>

              {/* Value */}
              <div className="text-right shrink-0 pl-2">
                {metric === 'collections' ? (
                  entry.collections_amount !== null ? (
                    <span className="text-xs font-bold text-[#0A0A0A] tabular-nums">
                      AED{' '}
                      {entry.collections_amount.toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-[#6B7272] italic">Hidden</span>
                  )
                ) : (
                  <span className="text-xs font-bold text-[#0A0A0A] tabular-nums">
                    {entry.admissions_count} {entry.admissions_count === 1 ? 'sale' : 'sales'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer link to full leaderboard */}
      <div className="pt-3 border-t border-[#E4E7E7]/60">
        <Link
          href="/leaderboard"
          className="w-full flex items-center justify-between text-xs font-semibold text-[#00805F] hover:text-[#00A57E] transition-colors py-1"
        >
          <span>View Full Leaderboard</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
