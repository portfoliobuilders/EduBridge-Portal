'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  Receipt,
  Users,
  AlertCircle,
  XCircle,
  Loader2,
  FileBarChart,
  FileCheck,
  ExternalLink,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatAED } from '@/lib/money'
import { getDubaiDateRange } from '@/lib/date'
import { fetchDashboardKpisAction } from '@/app/(app)/reports/actions'
import {
  DailyCollectionsChart,
  ModeCollectionsChart,
  StaffCollectionsChart,
  TopEntitiesChart,
} from '@/components/dashboard/OwnerCharts'
import { UpcomingCelebrationsWidget } from '@/components/celebrations/UpcomingCelebrationsWidget'
import { LeaderboardWidget } from '@/components/leaderboard/LeaderboardWidget'

interface StaffLeaderboardRow {
  staff_id: string
  staff_name: string
  admissions: number
  collected: number
  receipts_count: number
  avg_receipt: number
  outstanding: number
}

interface OwnerDashboardKpis {
  total_collected?: number
  receipts_count?: number
  new_admissions?: number
  total_outstanding?: number
  voided_count?: number
  by_mode?: Array<{ mode: string; total: number; count: number }>
  by_day?: Array<{ date: string; total: number; count: number }>
  by_staff?: StaffLeaderboardRow[]
  top_universities?: Array<{ university_id: string; university_name: string; total: number; count: number }>
  top_courses?: Array<{ course_id: string; course_name: string; total: number; count: number }>
}

interface OwnerDashboardProps {
  initialKpis: Record<string, unknown> | null
  initialRange: { from: string; to: string; label: string }
  documentStats?: { total_received: number; unverified: number; active_links: number } | null
  profile: { full_name: string; role: string }
}

export function OwnerDashboard({
  initialKpis,
  documentStats,
  profile,
}: OwnerDashboardProps) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [kpis, setKpis] = useState<OwnerDashboardKpis | null>(
    (initialKpis as unknown as OwnerDashboardKpis) || null
  )
  const [isPending, startTransition] = useTransition()

  const loadKpis = (
    p: 'today' | 'week' | 'month' | 'custom',
    cFrom?: string,
    cTo?: string
  ) => {
    const range = getDubaiDateRange(p, cFrom, cTo)
    startTransition(async () => {
      const res = await fetchDashboardKpisAction({
        from: range.from,
        to: range.to,
      })
      if (res.success && res.data) {
        setKpis(res.data as unknown as OwnerDashboardKpis)
      }
    })
  }

  const handlePeriodChange = (newPeriod: 'today' | 'week' | 'month' | 'custom') => {
    setPeriod(newPeriod)
    if (newPeriod !== 'custom') {
      loadKpis(newPeriod)
    }
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (customFrom && customTo) {
      loadKpis('custom', customFrom, customTo)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.full_name}`}
        subtitle={
          profile.role === 'admin'
            ? 'Team Lead Dashboard — Team performance & collections (Asia/Dubai)'
            : 'Super Admin Dashboard — Organization-wide financial performance (Asia/Dubai)'
        }
      >
        <div className="flex items-center gap-2">
          <Link href="/reports">
            <Button variant="outline" className="border-[#E4E7E7] rounded-xl text-xs gap-1.5 h-10">
              <FileBarChart className="w-4 h-4 text-muted-foreground" />
              Reports
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* Period Switcher Toolbar */}
      <div className="bg-white p-3 rounded-2xl border border-[#E4E7E7] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-[#F5F6F6] p-1 rounded-xl text-xs font-medium">
          {(['today', 'week', 'month', 'custom'] as const).map((p) => {
            const labels: Record<string, string> = {
              today: 'Today',
              week: 'This Week',
              month: 'This Month',
              custom: 'Custom Range',
            }
            const isSelected = period === p
            return (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  isSelected
                    ? 'bg-white text-[#0A0A0A] font-semibold shadow-xs'
                    : 'text-[#6B7272] hover:text-[#0A0A0A]'
                }`}
              >
                {labels[p]}
              </button>
            )
          })}
        </div>

        {period === 'custom' && (
          <form onSubmit={handleApplyCustom} className="flex items-center gap-2 text-xs">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 text-xs border-[#E4E7E7] rounded-lg"
              required
            />
            <span className="text-[#6B7272]">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 text-xs border-[#E4E7E7] rounded-lg"
              required
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 bg-[#00A57E] hover:bg-[#00805F] text-white rounded-lg text-xs"
            >
              Apply
            </Button>
          </form>
        )}

        {isPending && (
          <div className="flex items-center gap-1.5 text-xs text-[#00A57E]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Updating...</span>
          </div>
        )}
      </div>

      {/* Leaderboard & Celebrations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderboardWidget />
        <UpcomingCelebrationsWidget />
      </div>

      {/* Candidate Documents via Link Widget (Last 7 Days) */}
      {documentStats && (
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#0A0A0A] flex items-center gap-2">
                  <span>Documents received via link</span>
                  <span className="text-[11px] font-normal text-[#6B7272] bg-[#F5F6F6] px-2 py-0.5 rounded-full border border-[#E4E7E7]">
                    Last 7 days
                  </span>
                </h3>
                <p className="text-xs text-[#6B7272] mt-0.5">
                  Candidate self-uploaded files awaiting verification or archived across all candidates.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center sm:text-right">
                <span className="text-xs text-[#6B7272] block">Received</span>
                <span className="font-mono text-lg font-bold text-[#0A0A0A]">
                  {documentStats.total_received}
                </span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-xs text-[#6B7272] block">Unverified</span>
                <span
                  className={`font-mono text-lg font-bold ${
                    documentStats.unverified > 0 ? 'text-amber-600' : 'text-[#00805F]'
                  }`}
                >
                  {documentStats.unverified}
                </span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-xs text-[#6B7272] block">Active Links</span>
                <span className="font-mono text-lg font-bold text-[#6B7272]">
                  {documentStats.active_links}
                </span>
              </div>
              <Link href="/candidates">
                <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1 h-9 border-[#E4E7E7]">
                  <span>Candidates</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#00A57E]" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Collected</span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {formatAED(kpis?.total_collected || 0)}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">Excludes void receipts</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Receipts Issued</span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {kpis?.receipts_count || 0}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">Valid vouchers in period</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">New Admissions</span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {kpis?.new_admissions || 0}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">Enrolled in period</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Balance</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-amber-800 tabular-nums">
            {formatAED(kpis?.total_outstanding || 0)}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">All active candidate ledgers</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Voided Count</span>
            <div className="p-2 rounded-xl bg-red-50 text-red-600">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-red-700 tabular-nums">
            {kpis?.voided_count || 0}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">Cancelled in period</p>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Collections Per Day */}
        <Card className="border-[#E4E7E7] rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
              Daily Collections (AED)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyCollectionsChart data={kpis?.by_day || []} />
          </CardContent>
        </Card>

        {/* Chart 2: Collections by Payment Mode (Bar, not pie) */}
        <Card className="border-[#E4E7E7] rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
              Collections by Payment Mode (AED)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ModeCollectionsChart data={kpis?.by_mode || []} />
          </CardContent>
        </Card>

        {/* Chart 3: Collections by Staff (Horizontal Bar) */}
        <Card className="border-[#E4E7E7] rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
              Collections by Staff (AED)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StaffCollectionsChart data={kpis?.by_staff || []} />
          </CardContent>
        </Card>

        {/* Chart 4: Top Universities by Collections */}
        <Card className="border-[#E4E7E7] rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
              Top Universities by Revenue (AED)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopEntitiesChart
              data={kpis?.top_universities || []}
              entityNameKey="university_name"
            />
          </CardContent>
        </Card>
      </div>

      {/* Staff Performance Leaderboard */}
      <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-[#F5F6F6] border-b border-[#E4E7E7] py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
              Staff Performance Leaderboard
            </CardTitle>
            <span className="text-xs text-[#6B7272]">
              Ranked by collection volume for selected period
            </span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
              <tr>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4 text-center">New Admissions</th>
                <th className="py-3 px-4 text-right">Total Collected</th>
                <th className="py-3 px-4 text-right">Avg Receipt</th>
                <th className="py-3 px-4 text-right">Outstanding Balances</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
              {kpis?.by_staff && kpis.by_staff.length > 0 ? (
                kpis.by_staff.map((s) => (
                  <tr key={s.staff_id} className="hover:bg-[#F5F6F6]/50 transition">
                    <td className="py-3.5 px-4 font-sans font-medium text-[#0A0A0A]">
                      {s.staff_name}
                    </td>
                    <td className="py-3.5 px-4 text-center text-[#0A0A0A]">
                      {s.admissions}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#00A57E]">
                      {formatAED(Number(s.collected))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#6B7272]">
                      {formatAED(Number(s.avg_receipt))}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-amber-700">
                      {formatAED(Number(s.outstanding))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground font-sans">
                    No active staff activity found in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
