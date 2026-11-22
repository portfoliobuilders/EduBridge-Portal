'use client'

import React from 'react'
import Link from 'next/link'
import {
  DollarSign,
  TrendingUp,
  Users,
  Receipt,
  MessageCircle,
  ExternalLink,
  CreditCard,
  Banknote,
  QrCode,
  Building2,
  FileBarChart,
  FileCheck,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAED } from '@/lib/money'
import { formatDubaiDate, formatDubaiDateTime } from '@/lib/date'

interface PendingBalanceItem {
  enrollment_id: string
  student_id: string
  student_name: string
  student_code: string
  mobile?: string | null
  course_name: string
  university_name: string
  balance: number | string
  last_payment_at?: string | null
  days_since_last_payment?: number | null
  share_token: string
}

interface RecentReceiptItem {
  id: string
  receipt_no: string
  paid_at: string
  student_name: string
  mode: string
  purpose: string
  amount: number | string
  status: string
}

interface StaffKpisData {
  total_collected?: number
  receipts_count?: number
  new_admissions?: number
  by_mode?: Array<{ mode: string; total: number; count: number }>
}

interface StaffDashboardProps {
  todayKpis: StaffKpisData | null
  monthKpis: StaffKpisData | null
  pendingBalances: PendingBalanceItem[]
  recentReceipts: RecentReceiptItem[]
  myCandidateCount: number
  myReceiptCount: number
  documentStats?: { total_received: number; unverified: number; active_links: number } | null
  profile: { id: string; full_name: string; role: string }
  whatsappTemplate?: string
  appUrl: string
}

export function StaffDashboard({
  todayKpis,
  monthKpis,
  pendingBalances,
  recentReceipts,
  myCandidateCount,
  myReceiptCount,
  documentStats,
  profile,
  whatsappTemplate,
  appUrl,
}: StaffDashboardProps) {
  const modeIcons: Record<string, LucideIcon> = {
    cash: Banknote,
    card: CreditCard,
    link: QrCode,
    bank_transfer: Building2,
  }

  const modeLabels: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    link: 'Payment Link',
    bank_transfer: 'Bank Transfer',
  }

  const handleWhatsAppReminder = (item: PendingBalanceItem) => {
    const rawMobile = item.mobile ? item.mobile.replace(/[^0-9]/g, '') : ''
    const publicLink = `${appUrl}/r/statement/${item.share_token}`
    const defaultTemplate =
      'Dear {student_name}, your balance due with EduBridge Education is AED {balance}. Statement: {public_link}'
    const template = whatsappTemplate || defaultTemplate

    const text = template
      .replace(/{student_name}/g, item.student_name)
      .replace(/{balance}/g, Number(item.balance).toLocaleString('en-US', { minimumFractionDigits: 2 }))
      .replace(/{public_link}/g, publicLink)

    const url = `https://wa.me/${rawMobile}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.full_name}`}
        subtitle="Admissions & Collection Workspace — Dubai (Asia/Dubai)"
      >
        <div className="flex items-center gap-2">
          <Link href="/reports">
            <Button variant="outline" className="border-[#E4E7E7] rounded-xl text-xs gap-1.5 h-10">
              <FileBarChart className="w-4 h-4 text-muted-foreground" />
              My Reports
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* Primary KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tile 1: My collections today */}
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              My collections today
            </span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {formatAED(todayKpis?.total_collected || 0)}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">
            {todayKpis?.receipts_count || 0} receipts recorded today
          </p>
        </div>

        {/* Tile 2: My collections this month */}
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              My collections this month
            </span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {formatAED(monthKpis?.total_collected || 0)}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">
            {monthKpis?.new_admissions || 0} new admissions this month
          </p>
        </div>

        {/* Tile 3: My candidates */}
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              My candidates
            </span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {myCandidateCount}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">Total active candidates admitted</p>
        </div>

        {/* Tile 4: My receipts */}
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7E7] shadow-xs">
          <div className="flex items-center justify-between text-[#6B7272] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              My receipts
            </span>
            <div className="p-2 rounded-xl bg-[#E6F6F2] text-[#00A57E]">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-[#0A0A0A] tabular-nums">
            {myReceiptCount}
          </p>
          <p className="text-xs text-[#6B7272] mt-1">Total vouchers issued by me</p>
        </div>
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
                  Candidate self-uploaded files awaiting verification or archived.
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

      {/* Today's Collections by Mode Breakdown */}
      <Card className="border-[#E4E7E7] rounded-2xl shadow-xs">
        <CardHeader className="pb-3 border-b border-[#E4E7E7]">
          <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
            Today&apos;s Collections Breakdown by Payment Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['cash', 'card', 'link', 'bank_transfer'].map((m) => {
              const Icon = modeIcons[m] || Banknote
              const modeItem = (todayKpis?.by_mode || []).find((b) => b.mode === m)
              const total = modeItem ? Number(modeItem.total) : 0
              const count = modeItem ? modeItem.count : 0
              return (
                <div
                  key={m}
                  className="p-3.5 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/50 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[#6B7272]">
                      {modeLabels[m]}
                    </span>
                    <Icon className="w-4 h-4 text-[#00A57E]" />
                  </div>
                  <div>
                    <div className="text-base font-bold font-mono text-[#0A0A0A] tabular-nums">
                      {formatAED(total)}
                    </div>
                    <div className="text-[11px] text-[#6B7272] mt-0.5">
                      {count} {count === 1 ? 'receipt' : 'receipts'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending balances on my admissions (Top 10) */}
      <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-[#F5F6F6] border-b border-[#E4E7E7] py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
                Pending Balances on My Admissions (Top 10)
              </CardTitle>
              <p className="text-xs text-[#6B7272] mt-0.5">
                Prioritized by highest outstanding balance with direct WhatsApp reminder
              </p>
            </div>
            <Link href="/reports?tab=outstanding">
              <Button variant="ghost" size="sm" className="text-xs text-[#00A57E] hover:text-[#00805F] h-8">
                View all pending
              </Button>
            </Link>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
              <tr>
                <th className="py-3 px-4">Candidate</th>
                <th className="py-3 px-4">University & Course</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Last Payment</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7E7]">
              {pendingBalances && pendingBalances.length > 0 ? (
                pendingBalances.slice(0, 10).map((row) => (
                  <tr key={row.enrollment_id} className="hover:bg-[#F5F6F6]/40 transition">
                    <td className="py-3 px-4">
                      <Link
                        href={`/candidates/${row.student_id}`}
                        className="font-medium text-[#0A0A0A] hover:text-[#00A57E] flex items-center gap-1.5"
                      >
                        {row.student_name}
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </Link>
                      <span className="text-[11px] text-[#6B7272] font-mono">
                        {row.student_code}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#0A0A0A]">
                      <div className="font-medium">{row.course_name}</div>
                      <div className="text-[11px] text-[#6B7272]">{row.university_name}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 tabular-nums">
                      {formatAED(Number(row.balance))}
                    </td>
                    <td className="py-3 px-4 text-center text-[#6B7272]">
                      {row.last_payment_at ? (
                        <div>
                          <div>{formatDubaiDate(row.last_payment_at)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {row.days_since_last_payment}d ago
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No payments</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {row.mobile ? (
                        <Button
                          size="sm"
                          onClick={() => handleWhatsAppReminder(row)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-7 px-2.5 text-xs gap-1.5 shadow-xs"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">No mobile</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground font-sans">
                    No pending balances found on your admitted candidates!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* My 10 Recent Receipts */}
      <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-[#F5F6F6] border-b border-[#E4E7E7] py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#0A0A0A]">
              My Recent Receipts (Last 10)
            </CardTitle>
            <Link href="/reports?tab=collections">
              <Button variant="ghost" size="sm" className="text-xs text-[#00A57E] hover:text-[#00805F] h-8">
                View all collections
              </Button>
            </Link>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
              <tr>
                <th className="py-3 px-4">Receipt No</th>
                <th className="py-3 px-4">Date & Time (Dubai)</th>
                <th className="py-3 px-4">Candidate</th>
                <th className="py-3 px-4">Mode & Purpose</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
              {recentReceipts && recentReceipts.length > 0 ? (
                recentReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F5F6F6]/40 transition">
                    <td className="py-3 px-4 font-semibold text-[#0A0A0A]">
                      <Link
                        href={`/receipts/${r.id}`}
                        className="hover:text-[#00A57E] flex items-center gap-1"
                      >
                        {r.receipt_no}
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-[#6B7272] font-sans">
                      {formatDubaiDateTime(r.paid_at)}
                    </td>
                    <td className="py-3 px-4 font-sans font-medium text-[#0A0A0A]">
                      {r.student_name}
                    </td>
                    <td className="py-3 px-4 font-sans text-[#6B7272] capitalize">
                      {modeLabels[r.mode] || r.mode} · {r.purpose}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-[#00A57E]">
                      {formatAED(Number(r.amount))}
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          r.status === 'valid'
                            ? 'bg-[#E6F6F2] text-[#00A57E]'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground font-sans">
                    No receipts issued yet.
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
