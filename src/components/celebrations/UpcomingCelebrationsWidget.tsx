'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { Gift, Trophy, Sparkles } from 'lucide-react'
import {
  getUpcomingCelebrationsThisWeekAction,
  type UpcomingCelebration,
} from './actions'
import { cn } from '@/lib/utils'

export function UpcomingCelebrationsWidget() {
  const [upcoming, setUpcoming] = useState<UpcomingCelebration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCelebrations = () => {
    setLoading(true)
    setError(null)
    getUpcomingCelebrationsThisWeekAction()
      .then((res) => {
        if (res.success && res.upcoming) {
          setUpcoming(res.upcoming)
        } else if (!res.success) {
          setError(res.error || 'Failed to load celebrations')
        }
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load celebrations')
        setLoading(false)
      })
  }

  useEffect(() => {
    let ignore = false
    void Promise.resolve().then(() => {
      if (!ignore) {
        loadCelebrations()
      }
    })
    return () => {
      ignore = true
    }
  }, [])

  if (!loading && !error && upcoming.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between border-b border-[#E4E7E7] pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#00A57E]" />
          <h2 className="text-sm font-bold text-[#0A0A0A]">
            Celebrations This Week
          </h2>
        </div>
        <span className="text-[11px] font-semibold text-[#00805F] bg-[#E6F6F2] px-2 py-0.5 rounded-full">
          {upcoming.length} upcoming
        </span>
      </div>

      {loading ? (
        <div className="py-4 text-center text-xs text-[#6B7272]">
          Checking milestones...
        </div>
      ) : error ? (
        <div className="py-4 text-center space-y-2">
          <p className="text-xs text-red-600">Couldn&apos;t load upcoming celebrations</p>
          <button
            type="button"
            onClick={loadCelebrations}
            className="text-[11px] font-semibold text-[#00805F] hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {upcoming.map((u) => {
            const isToday = u.days_away === 0
            const isBirthday = u.kind === 'birthday'

            return (
              <div
                key={`${u.user_id}-${u.kind}`}
                className={cn(
                  'flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors',
                  isToday
                    ? 'bg-[#E6F6F2]/40 border-[#CCEDE5]'
                    : 'bg-white border-[#E4E7E7] hover:bg-[#F5F6F6]'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#00A57E] text-white flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt={u.full_name}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      u.full_name[0]
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0A0A0A] truncate">
                      {u.full_name}
                    </p>
                    <p className="text-[11px] text-[#6B7272] flex items-center gap-1">
                      {isBirthday ? (
                        <>
                          <Gift className="w-3 h-3 text-[#F5C451]" />
                          Birthday
                        </>
                      ) : (
                        <>
                          <Trophy className="w-3 h-3 text-[#F5C451]" />
                          {u.years}-Year Anniversary
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={cn(
                      'text-xs font-bold block',
                      isToday ? 'text-[#00805F]' : 'text-[#0A0A0A]'
                    )}
                  >
                    {isToday ? 'Today! 🎉' : u.celebration_date}
                  </span>
                  {!isToday && (
                    <span className="text-[10px] text-[#6B7272]">
                      In {u.days_away} day{u.days_away > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
