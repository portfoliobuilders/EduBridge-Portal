'use client'

import React, { useState, useTransition } from 'react'
import { Trophy, ShieldAlert, Filter } from 'lucide-react'
import {
  getLeaderboardAction,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardMetric,
} from './actions'
import { LeaderboardPodium } from '@/components/leaderboard/LeaderboardPodium'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import { StickyViewerPosition } from '@/components/leaderboard/StickyViewerPosition'
import { cn } from '@/lib/utils'

interface LeaderboardClientProps {
  initialEntries: LeaderboardEntry[]
  initialPeriod: LeaderboardPeriod
  initialMetric: LeaderboardMetric
  showAedToStaff: boolean
  viewerRole: string
  viewerId: string
}

export function LeaderboardClient({
  initialEntries,
  initialPeriod,
  initialMetric,
  showAedToStaff,
  viewerRole,
  viewerId,
}: LeaderboardClientProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>(initialPeriod)
  const [metric, setMetric] = useState<LeaderboardMetric>(initialMetric)
  const [teamScope, setTeamScope] = useState<'all' | 'my_team'>('all')
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries)
  const [isPending, startTransition] = useTransition()

  const isAdminOrSuper =
    viewerRole === 'super_admin' || viewerRole === 'owner' || viewerRole === 'admin'

  const handlePeriodChange = (newPeriod: LeaderboardPeriod) => {
    setPeriod(newPeriod)
    fetchData(newPeriod, metric, teamScope)
  }

  const handleMetricChange = (newMetric: LeaderboardMetric) => {
    setMetric(newMetric)
    fetchData(period, newMetric, teamScope)
  }

  const handleTeamScopeChange = (newScope: 'all' | 'my_team') => {
    setTeamScope(newScope)
    fetchData(period, metric, newScope)
  }

  const fetchData = (
    p: LeaderboardPeriod,
    m: LeaderboardMetric,
    scope: 'all' | 'my_team'
  ) => {
    startTransition(async () => {
      const teamId = scope === 'my_team' ? viewerId : null
      const res = await getLeaderboardAction({ period: p, metric: m, teamId })
      setEntries(res.data)
    })
  }

  const viewerEntry = entries.find((e) => e.is_self) || null
  const topThree = entries.slice(0, 3)

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-[#E6F6F2] text-[#00A57E] flex items-center justify-center shadow-xs">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Staff Leaderboard</h1>
              <p className="text-xs text-[#6B7272]">Performance rankings calculated in Dubai time</p>
            </div>
          </div>
        </div>

        {/* Period Selector Pills */}
        <div className="inline-flex rounded-xl bg-white p-1 border border-[#E4E7E7] shadow-xs self-start sm:self-auto">
          {(
            [
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'this_quarter', label: 'This Quarter' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isPending}
              onClick={() => handlePeriodChange(item.id)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                period === item.id
                  ? 'bg-[#00A57E] text-white shadow-xs'
                  : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6]'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Tabs & Team Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-white border border-[#E4E7E7] shadow-xs">
        {/* Metric Tabs */}
        <div className="inline-flex rounded-xl bg-[#F5F6F6] p-1 border border-[#E4E7E7]">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleMetricChange('admissions')}
            className={cn(
              'px-4 py-2 text-xs font-bold rounded-lg transition-all',
              metric === 'admissions'
                ? 'bg-white text-[#00805F] shadow-2xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            Admissions (New Enrollments)
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleMetricChange('collections')}
            className={cn(
              'px-4 py-2 text-xs font-bold rounded-lg transition-all',
              metric === 'collections'
                ? 'bg-white text-[#00805F] shadow-2xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            Collections (Net of Voids)
          </button>
        </div>

        {/* Team Filter (Admins / Super Admin only) */}
        {isAdminOrSuper && (
          <div className="flex items-center gap-2 px-2 self-end sm:self-auto">
            <Filter className="w-3.5 h-3.5 text-[#6B7272]" />
            <div className="inline-flex rounded-xl bg-[#F5F6F6] p-1 border border-[#E4E7E7]">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleTeamScopeChange('all')}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  teamScope === 'all'
                    ? 'bg-white text-[#00805F] shadow-2xs'
                    : 'text-[#6B7272] hover:text-[#0A0A0A]'
                )}
              >
                Company
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleTeamScopeChange('my_team')}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  teamScope === 'my_team'
                    ? 'bg-white text-[#00805F] shadow-2xs'
                    : 'text-[#6B7272] hover:text-[#0A0A0A]'
                )}
              >
                My Team
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AED Masking Notice for Staff when disabled */}
      {viewerRole === 'staff' && !showAedToStaff && metric === 'collections' && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] text-xs text-[#6B7272]">
          <ShieldAlert className="w-4 h-4 text-[#00A57E] shrink-0" />
          <span>
            Collection amounts are hidden by management policy. Your rank and admissions counts are live.
          </span>
        </div>
      )}

      {/* Loading Overlay or Podium + Table */}
      <div className={cn('space-y-6 transition-opacity', isPending && 'opacity-60 pointer-events-none')}>
        {/* Top 3 Podium */}
        <LeaderboardPodium
          topThree={topThree}
          metric={metric}
        />

        {/* Full Ranked Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-[#0A0A0A]">
              Complete Standings ({entries.length} staff)
            </h2>
            <span className="text-xs text-[#6B7272]">
              Ties resolved by earliest achievement
            </span>
          </div>

          <LeaderboardTable
            entries={entries}
            metric={metric}
          />
        </div>
      </div>

      {/* Sticky Floating Viewer Position */}
      <StickyViewerPosition
        viewerEntry={viewerEntry}
        metric={metric}
      />
    </div>
  )
}
