'use client'

import React, { useState, useEffect, useTransition } from 'react'
import {
  Download,
  Filter,
  Copy,
  Check,
  Loader2,
  DollarSign,
  AlertCircle,
  XCircle,
  FileSpreadsheet,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime, getDubaiDateRange } from '@/lib/date'
import { toast } from 'sonner'
import {
  fetchCollectionsReportAction,
  fetchOutstandingReportAction,
  fetchDayEndReportAction,
  fetchVoidsReportAction,
  fetchVatSummaryReportAction,
} from '@/app/(app)/reports/actions'

interface FilterOptions {
  universities: Array<{ id: string; name: string }>
  courses: Array<{ id: string; name: string; university_id: string }>
  staffList: Array<{ id: string; full_name: string }>
  vatEnabled: boolean
}

interface CollectionsRow {
  id: string
  receipt_no: string
  paid_at: string
  student_id: string
  student_name: string
  student_code: string
  amount: number
  vat_amount: number
  mode: string
  reference_no: string | null
  purpose: string
  purpose_note: string | null
  received_by: string
  received_by_name: string
  university_id: string | null
  university_name: string | null
  course_id: string | null
  course_name: string | null
}

interface OutstandingRow {
  enrollment_id: string
  student_id: string
  student_name: string
  student_code: string
  mobile: string | null
  university_name: string
  course_name: string
  total_payable: number
  total_paid: number
  balance: number
  admission_staff_id: string | null
  admission_staff_name: string | null
  days_since_last_payment: number | null
  last_payment_at: string | null
}

interface DayEndStaffSummary {
  staff_id: string
  staff_name: string
  cash_total: number
  cash_count: number
  card_total: number
  card_count: number
  link_total: number
  link_count: number
  bank_transfer_total: number
  bank_transfer_count: number
  total_collected: number
}

interface DayEndTotals {
  cash_total: number
  cash_count: number
  non_cash_total: number
  non_cash_count: number
  total_collected: number
  total_receipts: number
}

interface DayEndData {
  date: string
  staff_summary: DayEndStaffSummary[]
  totals: DayEndTotals
}

interface VoidsRow {
  id: string
  receipt_no: string
  paid_at: string
  student_name: string
  student_code: string
  amount: number
  received_by_name: string
  voided_by_name: string
  voided_at: string
  void_reason: string
}

interface VatMonthRow {
  month_num: number
  month_name: string
  taxable_amount: number
  vat_collected: number
  total_collected: number
  receipt_count: number
}

interface ReportsClientProps {
  filterOptions: FilterOptions
  userRole: string
  userId: string
  initialTab?: 'collections' | 'outstanding' | 'dayend' | 'voids' | 'vat'
}

export function ReportsClient({
  filterOptions,
  userRole,
  userId,
  initialTab = 'collections',
}: ReportsClientProps) {
  const isOwner = userRole === 'super_admin' || userRole === 'admin' || userRole === 'owner'
  const [activeTab, setActiveTab] = useState<
    'collections' | 'outstanding' | 'dayend' | 'voids' | 'vat'
  >(initialTab)

  // Filters state
  const defaultToday = getDubaiDateRange('today')
  const defaultMonth = getDubaiDateRange('month')

  const [dateFrom, setDateFrom] = useState(defaultMonth.from.slice(0, 10))
  const [dateTo, setDateTo] = useState(defaultToday.to.slice(0, 10))
  const [selectedStaff, setSelectedStaff] = useState<string>(isOwner ? '' : userId)
  const [selectedMode, setSelectedMode] = useState<string>('')
  const [selectedPurpose, setSelectedPurpose] = useState<string>('')
  const [selectedUni, setSelectedUni] = useState<string>('')
  const [selectedCourse, setSelectedCourse] = useState<string>('')

  // Day-end date
  const [dayEndDate, setDayEndDate] = useState(defaultToday.from.slice(0, 10))

  // VAT year
  const [vatYear, setVatYear] = useState(new Date().getFullYear())

  // Report data states
  const [collectionsData, setCollectionsData] = useState<{
    totals?: { total_amount?: number; total_vat?: number; count?: number }
    rows?: CollectionsRow[]
  } | null>(null)
  const [outstandingData, setOutstandingData] = useState<{
    totals?: {
      total_balance?: number
      total_payable?: number
      total_paid?: number
      count?: number
    }
    rows?: OutstandingRow[]
  } | null>(null)
  const [dayEndData, setDayEndData] = useState<DayEndData | null>(null)
  const [voidsData, setVoidsData] = useState<{
    totals?: { total_voided_amount?: number; count?: number }
    rows?: VoidsRow[]
  } | null>(null)
  const [vatData, setVatData] = useState<{
    totals?: {
      total_taxable?: number
      total_vat?: number
      total_revenue?: number
      receipt_count?: number
    }
    rows?: VatMonthRow[]
  } | null>(null)

  // Outstanding sorting
  const [outstandingSort, setOutstandingSort] = useState<'balance' | 'days' | 'name'>('balance')
  const [copiedReminder, setCopiedReminder] = useState(false)

  const [isPending, startTransition] = useTransition()

  // Load data for active tab
  const loadTabReport = (tab = activeTab) => {
    startTransition(async () => {
      const staffParam = isOwner ? selectedStaff || null : userId

      if (tab === 'collections') {
        const fromIso = `${dateFrom}T00:00:00+04:00`
        const toIso = `${dateTo}T23:59:59.999+04:00`
        const res = await fetchCollectionsReportAction({
          from: fromIso,
          to: toIso,
          staffId: staffParam,
          mode: selectedMode || null,
          purpose: selectedPurpose || null,
          universityId: selectedUni || null,
          courseId: selectedCourse || null,
        })
        if (res.success && res.data) {
          setCollectionsData(res.data as unknown as {
            totals?: { total_amount?: number; total_vat?: number; count?: number }
            rows?: CollectionsRow[]
          })
        }
      } else if (tab === 'outstanding') {
        const res = await fetchOutstandingReportAction({
          staffId: staffParam,
          universityId: selectedUni || null,
          courseId: selectedCourse || null,
          minBalance: 0,
        })
        if (res.success && res.data) {
          setOutstandingData(res.data as unknown as {
            totals?: {
              total_balance?: number
              total_payable?: number
              total_paid?: number
              count?: number
            }
            rows?: OutstandingRow[]
          })
        }
      } else if (tab === 'dayend') {
        const res = await fetchDayEndReportAction({
          date: dayEndDate,
          staffId: staffParam,
        })
        if (res.success && res.data) {
          setDayEndData(res.data as unknown as DayEndData)
        }
      } else if (tab === 'voids') {
        const fromIso = `${dateFrom}T00:00:00+04:00`
        const toIso = `${dateTo}T23:59:59.999+04:00`
        const res = await fetchVoidsReportAction({
          from: fromIso,
          to: toIso,
          staffId: staffParam,
        })
        if (res.success && res.data) {
          setVoidsData(res.data as unknown as {
            totals?: { total_voided_amount?: number; count?: number }
            rows?: VoidsRow[]
          })
        }
      } else if (tab === 'vat') {
        const res = await fetchVatSummaryReportAction({ year: vatYear })
        if (res.success && res.data) {
          setVatData(res.data as unknown as {
            totals?: {
              total_taxable?: number
              total_vat?: number
              total_revenue?: number
              receipt_count?: number
            }
            rows?: VatMonthRow[]
          })
        }
      }
    })
  }

  useEffect(() => {
    loadTabReport(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Filter courses based on selected university
  const filteredCourses = selectedUni
    ? filterOptions.courses.filter((c) => c.university_id === selectedUni)
    : filterOptions.courses

  // CSV export URL builder
  const getCsvExportUrl = () => {
    const params = new URLSearchParams()
    params.set('type', activeTab)

    if (activeTab === 'collections') {
      params.set('from', `${dateFrom}T00:00:00+04:00`)
      params.set('to', `${dateTo}T23:59:59.999+04:00`)
      if (selectedStaff) params.set('staff_id', selectedStaff)
      if (selectedMode) params.set('mode', selectedMode)
      if (selectedPurpose) params.set('purpose', selectedPurpose)
      if (selectedUni) params.set('university_id', selectedUni)
      if (selectedCourse) params.set('course_id', selectedCourse)
    } else if (activeTab === 'outstanding') {
      if (selectedStaff) params.set('staff_id', selectedStaff)
      if (selectedUni) params.set('university_id', selectedUni)
      if (selectedCourse) params.set('course_id', selectedCourse)
    } else if (activeTab === 'dayend') {
      params.set('date', dayEndDate)
      if (selectedStaff) params.set('staff_id', selectedStaff)
    } else if (activeTab === 'voids') {
      params.set('from', `${dateFrom}T00:00:00+04:00`)
      params.set('to', `${dateTo}T23:59:59.999+04:00`)
      if (selectedStaff) params.set('staff_id', selectedStaff)
    } else if (activeTab === 'vat') {
      params.set('year', String(vatYear))
    }

    return `/api/reports/export?${params.toString()}`
  }

  // Copy reminder list for outstanding candidates
  const handleCopyReminderList = () => {
    const rows = outstandingData?.rows || []
    if (rows.length === 0) {
      toast.info('No outstanding candidates to copy')
      return
    }

    const textLines = rows.map((r, i) => {
      const lastPay = r.last_payment_at
        ? `${r.days_since_last_payment}d ago`
        : 'Never'
      return `${i + 1}. ${r.student_name} (${r.student_code}) - Balance: ${formatAED(r.balance)} - Mobile: ${r.mobile || 'N/A'} - Last Paid: ${lastPay}`
    })

    const fullText = `EDUBRIDGE OUTSTANDING REMINDER LIST (${new Date().toLocaleDateString()}):\n\n` + textLines.join('\n')
    navigator.clipboard.writeText(fullText)
    setCopiedReminder(true)
    toast.success(`Copied ${rows.length} candidate reminder details to clipboard!`)
    setTimeout(() => setCopiedReminder(false), 2500)
  }

  // Sorted outstanding rows
  const sortedOutstandingRows = React.useMemo(() => {
    const list = [...(outstandingData?.rows || [])]
    if (outstandingSort === 'balance') {
      return list.sort((a, b) => Number(b.balance) - Number(a.balance))
    }
    if (outstandingSort === 'days') {
      return list.sort(
        (a, b) =>
          Number(b.days_since_last_payment || 9999) -
          Number(a.days_since_last_payment || 9999)
      )
    }
    if (outstandingSort === 'name') {
      return list.sort((a, b) => a.student_name.localeCompare(b.student_name))
    }
    return list
  }, [outstandingData, outstandingSort])

  return (
    <div className="space-y-6">
      {/* Top Report Tab Navigation Bar */}
      <div className="bg-white p-2 rounded-2xl border border-[#E4E7E7] shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('collections')}
            className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'collections'
                ? 'bg-[#00A57E] text-white font-semibold shadow-xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6]'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Collections</span>
          </button>

          <button
            onClick={() => setActiveTab('outstanding')}
            className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'outstanding'
                ? 'bg-[#00A57E] text-white font-semibold shadow-xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6]'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Outstanding Balances</span>
          </button>

          <button
            onClick={() => setActiveTab('dayend')}
            className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'dayend'
                ? 'bg-[#00A57E] text-white font-semibold shadow-xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6]'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Day-End Cash</span>
          </button>

          <button
            onClick={() => setActiveTab('voids')}
            className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'voids'
                ? 'bg-[#00A57E] text-white font-semibold shadow-xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6]'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Void Logs</span>
          </button>

          {filterOptions.vatEnabled && (
            <button
              onClick={() => setActiveTab('vat')}
              className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'vat'
                  ? 'bg-[#00A57E] text-white font-semibold shadow-xs'
                  : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>VAT Summary</span>
            </button>
          )}
        </div>

        {/* Export CSV action button */}
        <a href={getCsvExportUrl()} download>
          <Button
            variant="outline"
            size="sm"
            className="border-[#E4E7E7] text-xs h-9 gap-1.5 rounded-xl hover:bg-[#F5F6F6]"
          >
            <Download className="w-3.5 h-3.5 text-[#00A57E]" />
            <span>Export CSV</span>
          </Button>
        </a>
      </div>

      {/* Filter Toolbar (Adaptive by Tab) */}
      <Card className="border-[#E4E7E7] rounded-2xl shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0A0A0A]">
            <Filter className="w-3.5 h-3.5 text-[#00A57E]" />
            <span>Report Filters</span>
            {isPending && (
              <span className="text-[11px] text-[#00A57E] flex items-center gap-1 font-normal ml-auto">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading report...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Date Filters for Collections and Voids */}
            {(activeTab === 'collections' || activeTab === 'voids') && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#6B7272] font-medium">From Date (Dubai)</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 text-xs border-[#E4E7E7] rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#6B7272] font-medium">To Date (Dubai)</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 text-xs border-[#E4E7E7] rounded-xl"
                  />
                </div>
              </>
            )}

            {/* Date Picker for Day-End Cash */}
            {activeTab === 'dayend' && (
              <div className="space-y-1">
                <label className="text-[11px] text-[#6B7272] font-medium">Closing Date (Dubai)</label>
                <Input
                  type="date"
                  value={dayEndDate}
                  onChange={(e) => setDayEndDate(e.target.value)}
                  className="h-9 text-xs border-[#E4E7E7] rounded-xl"
                />
              </div>
            )}

            {/* Year Selector for VAT Summary */}
            {activeTab === 'vat' && (
              <div className="space-y-1">
                <label className="text-[11px] text-[#6B7272] font-medium">Tax Year</label>
                <select
                  value={vatYear}
                  onChange={(e) => setVatYear(parseInt(e.target.value, 10))}
                  className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-white"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Staff Filter (Owner can choose; Staff forced to self) */}
            {activeTab !== 'vat' && (
              <div className="space-y-1">
                <label className="text-[11px] text-[#6B7272] font-medium">Staff Member</label>
                {isOwner ? (
                  <select
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                    className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-white"
                  >
                    <option value="">All Staff Members</option>
                    {filterOptions.staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    disabled
                    value={filterOptions.staffList.find((s) => s.id === userId)?.full_name || 'My Activity'}
                    className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-gray-100 text-[#6B7272] cursor-not-allowed"
                  />
                )}
              </div>
            )}

            {/* Mode & Purpose Filters (Collections only) */}
            {activeTab === 'collections' && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#6B7272] font-medium">Payment Mode</label>
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value)}
                    className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-white"
                  >
                    <option value="">All Modes</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="link">Payment Link</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-[#6B7272] font-medium">Payment Purpose</label>
                  <select
                    value={selectedPurpose}
                    onChange={(e) => setSelectedPurpose(e.target.value)}
                    className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-white"
                  >
                    <option value="">All Purposes</option>
                    <option value="admission">Admission</option>
                    <option value="repayment">Repayment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            )}

            {/* University & Course Filters (Collections and Outstanding) */}
            {(activeTab === 'collections' || activeTab === 'outstanding') && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#6B7272] font-medium">University</label>
                  <select
                    value={selectedUni}
                    onChange={(e) => {
                      setSelectedUni(e.target.value)
                      setSelectedCourse('')
                    }}
                    className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-white"
                  >
                    <option value="">All Universities</option>
                    {filterOptions.universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-[#6B7272] font-medium">Course</label>
                  <select
                    value={selectedCourse}
                    onChange={(e) => setSelectedCourse(e.target.value)}
                    className="w-full h-9 text-xs border border-[#E4E7E7] rounded-xl px-2.5 bg-white"
                  >
                    <option value="">All Courses</option>
                    {filteredCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => loadTabReport()}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl h-8 px-4 text-xs font-medium"
            >
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TAB 1: COLLECTIONS REPORT */}
      {activeTab === 'collections' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Total Collections
              </span>
              <div className="text-xl font-bold font-mono text-[#00A57E] mt-1 tabular-nums">
                {formatAED(collectionsData?.totals?.total_amount || 0)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Receipts Count
              </span>
              <div className="text-xl font-bold font-mono text-[#0A0A0A] mt-1 tabular-nums">
                {collectionsData?.totals?.count || 0}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                VAT Collected
              </span>
              <div className="text-xl font-bold font-mono text-[#0A0A0A] mt-1 tabular-nums">
                {formatAED(collectionsData?.totals?.total_vat || 0)}
              </div>
            </div>
          </div>

          {/* Table */}
          <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Receipt No</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Candidate</th>
                    <th className="py-3 px-4">Mode & Ref</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4">Received By</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
                  {collectionsData?.rows && collectionsData.rows.length > 0 ? (
                    collectionsData.rows.map((r: CollectionsRow) => (
                      <tr key={r.id} className="hover:bg-[#F5F6F6]/40 transition">
                        <td className="py-3 px-4 font-semibold text-[#0A0A0A]">
                          <a href={`/receipts/${r.id}`} className="hover:text-[#00A57E]">
                            {r.receipt_no}
                          </a>
                        </td>
                        <td className="py-3 px-4 text-[#6B7272] font-sans">
                          {formatDubaiDateTime(r.paid_at)}
                        </td>
                        <td className="py-3 px-4 font-sans text-[#0A0A0A]">
                          <div className="font-medium">{r.student_name}</div>
                          <div className="text-[11px] text-[#6B7272] font-mono">{r.student_code}</div>
                        </td>
                        <td className="py-3 px-4 font-sans text-[#0A0A0A] capitalize">
                          <div>{r.mode}</div>
                        </td>
                        <td className="py-3 px-4 font-sans text-[#6B7272] capitalize">
                          {r.purpose}
                          {r.purpose_note ? ` (${r.purpose_note})` : ''}
                        </td>
                        <td className="py-3 px-4 font-sans text-[#6B7272]">
                          {r.received_by_name || 'Staff'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#00A57E]">
                          {formatAED(Number(r.amount))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground font-sans">
                        No collections match the specified filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: OUTSTANDING BALANCES REPORT */}
      {activeTab === 'outstanding' && (
        <div className="space-y-4">
          {/* Summary and Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
            <div>
              <div className="text-xs text-[#6B7272] uppercase font-semibold">Total Outstanding Balance</div>
              <div className="text-2xl font-bold font-mono text-amber-700 mt-0.5 tabular-nums">
                {formatAED(outstandingData?.totals?.total_balance || 0)}
              </div>
              <div className="text-xs text-[#6B7272] mt-0.5">
                Across {outstandingData?.totals?.count || 0} active candidate ledgers
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#F5F6F6] p-1 rounded-xl text-xs">
                <button
                  onClick={() => setOutstandingSort('balance')}
                  className={`px-2.5 py-1 rounded-lg ${
                    outstandingSort === 'balance' ? 'bg-white font-semibold text-[#0A0A0A]' : 'text-[#6B7272]'
                  }`}
                >
                  Highest Balance
                </button>
                <button
                  onClick={() => setOutstandingSort('days')}
                  className={`px-2.5 py-1 rounded-lg ${
                    outstandingSort === 'days' ? 'bg-white font-semibold text-[#0A0A0A]' : 'text-[#6B7272]'
                  }`}
                >
                  Days Inactive
                </button>
                <button
                  onClick={() => setOutstandingSort('name')}
                  className={`px-2.5 py-1 rounded-lg ${
                    outstandingSort === 'name' ? 'bg-white font-semibold text-[#0A0A0A]' : 'text-[#6B7272]'
                  }`}
                >
                  Name
                </button>
              </div>

              <Button
                onClick={handleCopyReminderList}
                className="bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl text-xs h-9 gap-1.5 shadow-xs"
              >
                {copiedReminder ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy Reminder List</span>
              </Button>
            </div>
          </div>

          {/* Outstanding Table */}
          <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Candidate</th>
                    <th className="py-3 px-4">University & Course</th>
                    <th className="py-3 px-4">Admission Staff</th>
                    <th className="py-3 px-4 text-right">Payable</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Days Inactive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
                  {sortedOutstandingRows.length > 0 ? (
                    sortedOutstandingRows.map((r: OutstandingRow) => (
                      <tr key={r.enrollment_id} className="hover:bg-[#F5F6F6]/40 transition">
                        <td className="py-3 px-4 font-sans text-[#0A0A0A]">
                          <a
                            href={`/candidates/${r.student_id}`}
                            className="font-medium hover:text-[#00A57E]"
                          >
                            {r.student_name}
                          </a>
                          <div className="text-[11px] text-[#6B7272] font-mono">
                            {r.student_code} · {r.mobile}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans text-[#0A0A0A]">
                          <div className="font-medium">{r.course_name}</div>
                          <div className="text-[11px] text-[#6B7272]">{r.university_name}</div>
                        </td>
                        <td className="py-3 px-4 font-sans text-[#6B7272]">
                          {r.admission_staff_name || 'Staff'}
                        </td>
                        <td className="py-3 px-4 text-right text-[#0A0A0A]">
                          {formatAED(Number(r.total_payable))}
                        </td>
                        <td className="py-3 px-4 text-right text-[#00A57E]">
                          {formatAED(Number(r.total_paid))}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-700">
                          {formatAED(Number(r.balance))}
                        </td>
                        <td className="py-3 px-4 text-center font-sans text-[#6B7272]">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-800 font-medium">
                            {r.days_since_last_payment} days
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground font-sans">
                        All enrolled candidates are fully settled! No outstanding balances.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: DAY-END CASH REPORT */}
      {activeTab === 'dayend' && (
        <div className="space-y-4">
          {/* Day Totals Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Total Cash Count (In-Hand)
              </span>
              <div className="text-xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                {formatAED(dayEndData?.totals?.cash_total || 0)}
              </div>
              <p className="text-[11px] text-[#6B7272] mt-0.5">
                {dayEndData?.totals?.cash_count || 0} cash transactions
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Non-Cash Collections
              </span>
              <div className="text-xl font-bold font-mono text-blue-700 mt-1 tabular-nums">
                {formatAED(dayEndData?.totals?.non_cash_total || 0)}
              </div>
              <p className="text-[11px] text-[#6B7272] mt-0.5">
                {dayEndData?.totals?.non_cash_count || 0} card, link & bank transfers
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Grand Total Collected
              </span>
              <div className="text-xl font-bold font-mono text-[#00A57E] mt-1 tabular-nums">
                {formatAED(dayEndData?.totals?.total_collected || 0)}
              </div>
              <p className="text-[11px] text-[#6B7272] mt-0.5">
                {dayEndData?.totals?.total_receipts || 0} total receipts issued on {dayEndDate}
              </p>
            </div>
          </div>

          {/* Breakdown Per Staff Member */}
          <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="bg-[#F5F6F6] border-b border-[#E4E7E7] py-3.5">
              <CardTitle className="text-xs font-semibold text-[#0A0A0A] uppercase tracking-wider">
                Staff Closing Breakdown for {dayEndDate}
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4 text-right">Cash In-Hand</th>
                    <th className="py-3 px-4 text-right">Card</th>
                    <th className="py-3 px-4 text-right">Payment Link</th>
                    <th className="py-3 px-4 text-right">Bank Transfer</th>
                    <th className="py-3 px-4 text-right">Staff Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
                  {dayEndData?.staff_summary && dayEndData.staff_summary.length > 0 ? (
                    dayEndData.staff_summary.map((s: DayEndStaffSummary) => (
                      <tr key={s.staff_id} className="hover:bg-[#F5F6F6]/40 transition">
                        <td className="py-3 px-4 font-sans font-medium text-[#0A0A0A]">
                          {s.staff_name}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          {formatAED(Number(s.cash_total))}
                          <span className="text-[10px] text-[#6B7272] ml-1">({s.cash_count})</span>
                        </td>
                        <td className="py-3 px-4 text-right text-[#0A0A0A]">
                          {formatAED(Number(s.card_total))}
                        </td>
                        <td className="py-3 px-4 text-right text-[#0A0A0A]">
                          {formatAED(Number(s.link_total))}
                        </td>
                        <td className="py-3 px-4 text-right text-[#0A0A0A]">
                          {formatAED(Number(s.bank_transfer_total))}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#00A57E]">
                          {formatAED(Number(s.total_collected))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground font-sans">
                        No transactions recorded on {dayEndDate}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: VOIDS REPORT */}
      {activeTab === 'voids' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Total Voided Volume
              </span>
              <div className="text-xl font-bold font-mono text-red-700 mt-1 tabular-nums">
                {formatAED(voidsData?.totals?.total_voided_amount || 0)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Voided Vouchers Count
              </span>
              <div className="text-xl font-bold font-mono text-[#0A0A0A] mt-1 tabular-nums">
                {voidsData?.totals?.count || 0}
              </div>
            </div>
          </div>

          <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Receipt No</th>
                    <th className="py-3 px-4">Candidate</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Received By</th>
                    <th className="py-3 px-4">Voided By</th>
                    <th className="py-3 px-4">Void Date & Time</th>
                    <th className="py-3 px-4">Mandatory Void Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7E7]">
                  {voidsData?.rows && voidsData.rows.length > 0 ? (
                    voidsData.rows.map((r: VoidsRow) => (
                      <tr key={r.id} className="hover:bg-[#F5F6F6]/40 transition">
                        <td className="py-3 px-4 font-mono font-semibold text-red-700">
                          <a href={`/receipts/${r.id}`} className="hover:underline">
                            {r.receipt_no}
                          </a>
                        </td>
                        <td className="py-3 px-4 text-[#0A0A0A]">
                          <div className="font-medium">{r.student_name}</div>
                          <div className="text-[11px] text-[#6B7272] font-mono">{r.student_code}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-red-700 tabular-nums">
                          {formatAED(Number(r.amount))}
                        </td>
                        <td className="py-3 px-4 text-[#6B7272]">{r.received_by_name || 'Staff'}</td>
                        <td className="py-3 px-4 text-[#0A0A0A] font-medium">
                          {r.voided_by_name || 'Owner'}
                        </td>
                        <td className="py-3 px-4 text-[#6B7272]">
                          {r.voided_at ? formatDubaiDateTime(r.voided_at) : '—'}
                        </td>
                        <td className="py-3 px-4 text-red-700 font-medium max-w-xs">
                          {r.void_reason || '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground font-sans">
                        No voided receipts found in selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: VAT SUMMARY REPORT */}
      {activeTab === 'vat' && filterOptions.vatEnabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Total Taxable Base ({vatYear})
              </span>
              <div className="text-xl font-bold font-mono text-[#0A0A0A] mt-1 tabular-nums">
                {formatAED(vatData?.totals?.total_taxable || 0)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Total VAT Collected (5%)
              </span>
              <div className="text-xl font-bold font-mono text-[#00A57E] mt-1 tabular-nums">
                {formatAED(vatData?.totals?.total_vat || 0)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E4E7E7] shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider">
                Total Gross Revenue
              </span>
              <div className="text-xl font-bold font-mono text-[#0A0A0A] mt-1 tabular-nums">
                {formatAED(vatData?.totals?.total_revenue || 0)}
              </div>
            </div>
          </div>

          <Card className="border-[#E4E7E7] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F6] text-[#6B7272] border-b border-[#E4E7E7] uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Month</th>
                    <th className="py-3 px-4 text-right">Taxable Amount</th>
                    <th className="py-3 px-4 text-right">VAT Collected (5%)</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                    <th className="py-3 px-4 text-center">Receipts Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
                  {vatData?.rows && vatData.rows.length > 0 ? (
                    vatData.rows.map((m: VatMonthRow) => (
                      <tr key={m.month_num} className="hover:bg-[#F5F6F6]/40 transition">
                        <td className="py-3 px-4 font-sans font-medium text-[#0A0A0A]">
                          {m.month_name}
                        </td>
                        <td className="py-3 px-4 text-right text-[#0A0A0A]">
                          {formatAED(Number(m.taxable_amount))}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#00A57E]">
                          {formatAED(Number(m.vat_collected))}
                        </td>
                        <td className="py-3 px-4 text-right text-[#0A0A0A]">
                          {formatAED(Number(m.total_collected))}
                        </td>
                        <td className="py-3 px-4 text-center text-[#6B7272] font-sans">
                          {m.receipt_count}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground font-sans">
                        No VAT data available for {vatYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
