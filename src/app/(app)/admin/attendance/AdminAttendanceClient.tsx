'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react'
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  Download,
  Plus,
  Calendar as CalendarIcon,
  Search,
  Check,
  X,
  Building,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OfficeDialog } from '@/components/attendance/OfficeDialog'
import {
  approveFieldPunchAction,
  approveLeaveAction,
  approveRegularizationAction,
} from '@/app/(app)/attendance/actions'
import {
  getAdminTodayBoardAction,
  getAdminTeamMonthlySheetAction,
  getOfficesAction,
  exportAttendanceCsvAction,
} from './actions'
import { formatWorkedHours } from '@/lib/attendance/utils'

interface AdminAttendanceClientProps {
  initialTodayData: any
  initialSheetData: any
  offices: any[]
}

export function AdminAttendanceClient({
  initialTodayData,
  initialSheetData,
  offices: initialOffices,
}: AdminAttendanceClientProps) {
  const [activeTab, setActiveTab] = useState<'today' | 'matrix' | 'approvals' | 'offices'>('today')
  const [todayData, setTodayData] = useState(initialTodayData)
  const [sheetData, setSheetData] = useState(initialSheetData)
  const [offices, setOffices] = useState(initialOffices)
  const [officeModalOpen, setOfficeModalOpen] = useState(false)
  const [selectedOffice, setSelectedOffice] = useState<any | null>(null)
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const reloadData = async () => {
    const [tRes, sRes, oRes] = await Promise.all([
      getAdminTodayBoardAction(),
      getAdminTeamMonthlySheetAction(sheetData?.yearMonth),
      getOfficesAction(),
    ])
    if (tRes.success) setTodayData(tRes.data)
    if (sRes.success) setSheetData(sRes.data)
    if (oRes.success) setOffices(oRes.data || [])
  }

  // Handle approvals
  const handleApproveFieldPunch = async (id: string, action: 'approve' | 'reject') => {
    const res = await approveFieldPunchAction(id, action)
    if (res.success) reloadData()
  }

  const handleApproveLeave = async (id: string, action: 'approve' | 'reject') => {
    const res = await approveLeaveAction(id, action)
    if (res.success) reloadData()
  }

  const handleApproveRegularization = async (id: string, action: 'approve' | 'reject') => {
    const res = await approveRegularizationAction(id, action)
    if (res.success) reloadData()
  }

  // CSV Export Download
  const handleExportCsv = async (type: 'daily' | 'monthly') => {
    setExporting(true)
    const res = await exportAttendanceCsvAction({
      type,
      date: todayData?.todayStr,
      yearMonth: sheetData?.yearMonth,
    })
    setExporting(false)

    if (res.success && res.csv) {
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename || 'attendance.csv'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const counts = todayData?.counts || {
    in: 0,
    late: 0,
    notYetIn: 0,
    onLeave: 0,
    pendingFieldPunches: 0,
    pendingLeaves: 0,
    pendingRegularizations: 0,
    flaggedPunches: 0,
  }

  const totalPendingApprovals =
    counts.pendingFieldPunches + counts.pendingLeaves + counts.pendingRegularizations

  return (
    <div className="space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0A0A0A]">
            Attendance &amp; Workforce Console
          </h1>
          <p className="text-xs text-[#6B7272] mt-0.5">
            Real-time geofenced punch monitoring, approvals queue, team monthly sheets, and office setup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => handleExportCsv('daily')}
            className="text-xs font-semibold h-9 rounded-xl border-[#E4E7E7] hover:bg-[#F5F6F6] gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Today CSV
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => handleExportCsv('monthly')}
            className="text-xs font-semibold h-9 rounded-xl border-[#E4E7E7] hover:bg-[#F5F6F6] gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Payroll CSV
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#E4E7E7] pb-px overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'today'
              ? 'border-[#00A57E] text-[#00A57E] bg-white shadow-2xs'
              : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Today Board
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'matrix'
              ? 'border-[#00A57E] text-[#00A57E] bg-white shadow-2xs'
              : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A]'
          }`}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          Team Monthly Sheet
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'approvals'
              ? 'border-[#00A57E] text-[#00A57E] bg-white shadow-2xs'
              : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A]'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approvals
          {totalPendingApprovals > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {totalPendingApprovals}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('offices')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'offices'
              ? 'border-[#00A57E] text-[#00A57E] bg-white shadow-2xs'
              : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A]'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          Offices &amp; Geofencing ({offices.length})
        </button>
      </div>

      {/* TAB 1: TODAY BOARD */}
      {activeTab === 'today' && (
        <div className="space-y-6">
          {/* Real-time counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] block">Punched In</span>
              <span className="text-xl font-bold text-[#00805F] mt-1 block">{counts.in}</span>
              <span className="text-[10px] text-[#6B7272] mt-0.5 block">Active on duty</span>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] block">Late Arrivals</span>
              <span className="text-xl font-bold text-[#B7791F] mt-1 block">{counts.late}</span>
              <span className="text-[10px] text-amber-700 mt-0.5 block">Arrived after grace</span>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] block">Not Yet In</span>
              <span className="text-xl font-bold text-gray-700 mt-1 block">{counts.notYetIn}</span>
              <span className="text-[10px] text-[#6B7272] mt-0.5 block">Expected today</span>
            </div>

            <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
              <span className="text-[11px] font-semibold text-[#6B7272] block">On Leave</span>
              <span className="text-xl font-bold text-blue-600 mt-1 block">{counts.onLeave}</span>
              <span className="text-[10px] text-blue-700 mt-0.5 block">Approved leaves</span>
            </div>
          </div>

          {/* Flagged Punches Section */}
          {todayData?.flaggedPunches && todayData.flaggedPunches.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Flagged Punches for Review ({todayData.flaggedPunches.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {todayData.flaggedPunches.map((p: any) => (
                  <div key={p.id} className="bg-white p-3 rounded-xl border border-amber-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0A0A0A]">{p.profile?.full_name || 'Staff'}</span>
                      <span className="font-mono text-[#6B7272]">
                        {new Date(p.at).toLocaleTimeString('en-GB')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {p.flags?.map((fl: string) => (
                        <span key={fl} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                          {fl.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today Staff Status Table */}
          <div className="bg-white rounded-2xl border border-[#E4E7E7] overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[#F5F6F6] flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold text-[#0A0A0A]">Staff Status (Today)</h2>
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-[#6B7272] absolute left-3 top-2.5" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter staff by name..."
                  className="h-8 pl-8 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F5F6F6] border-b border-[#E4E7E7] text-[#6B7272] font-semibold">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">First In</th>
                    <th className="py-3 px-4">Last Out</th>
                    <th className="py-3 px-4">Worked Time</th>
                    <th className="py-3 px-4">Late</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F6F6]">
                  {[...todayData.inList, ...todayData.notYetInList, ...todayData.onLeaveList]
                    .filter((item) =>
                      !searchQuery ||
                      item.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F6F6]/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-[#0A0A0A]">
                          {item.full_name}
                        </td>
                        <td className="py-3 px-4 text-[#6B7272] capitalize">{item.role}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize border ${
                              item.isCurrentlyIn
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : item.day?.status === 'late'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : item.day?.status === 'on_leave'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {item.isCurrentlyIn ? 'Punched In' : item.day?.status || 'Not In'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#6B7272]">
                          {item.day?.first_in ? new Date(item.day.first_in).toLocaleTimeString('en-GB') : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#6B7272]">
                          {item.day?.last_out ? new Date(item.day.last_out).toLocaleTimeString('en-GB') : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#0A0A0A]">
                          {formatWorkedHours(item.day?.worked_minutes || 0)}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {item.day?.late_minutes > 0 ? (
                            <span className="text-amber-700 font-semibold">{item.day.late_minutes}m</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEAM MONTHLY SHEET */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-[#E4E7E7] overflow-hidden shadow-xs space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0A0A0A]">
              Team Monthly Attendance Matrix ({sheetData?.yearMonth})
            </h2>
          </div>

          <div className="overflow-x-auto border border-[#E4E7E7] rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5F6F6] border-b border-[#E4E7E7] text-[#6B7272] font-semibold">
                  <th className="py-2.5 px-3 sticky left-0 bg-[#F5F6F6] z-10 min-w-[150px]">
                    Staff Name
                  </th>
                  {Array.from({ length: sheetData?.daysInMonth || 30 }).map((_, i) => (
                    <th key={i} className="py-2.5 px-1.5 text-center min-w-[28px]">
                      {i + 1}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right">Total Hours</th>
                  <th className="py-2.5 px-2 text-center">P</th>
                  <th className="py-2.5 px-2 text-center">L</th>
                  <th className="py-2.5 px-2 text-center">A</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F6F6]">
                {sheetData?.matrix?.map((row: any) => (
                  <tr key={row.staff.id} className="hover:bg-[#F5F6F6]/50">
                    <td className="py-2.5 px-3 font-semibold text-[#0A0A0A] sticky left-0 bg-white z-10 whitespace-nowrap">
                      {row.staff.full_name}
                    </td>
                    {Array.from({ length: sheetData.daysInMonth }).map((_, i) => {
                      const dateStr = `${sheetData.yearMonth}-${String(i + 1).padStart(2, '0')}`
                      const dayRec = row.dayMap[dateStr]
                      const status = dayRec?.status

                      return (
                        <td key={dateStr} className="py-2 px-1 text-center">
                          {status === 'present' ? (
                            <span className="w-3.5 h-3.5 inline-block rounded-full bg-[#00A57E]" title="Present" />
                          ) : status === 'late' ? (
                            <span className="w-3.5 h-3.5 inline-block rounded-full bg-[#B7791F]" title="Late" />
                          ) : status === 'absent' ? (
                            <span className="w-3.5 h-3.5 inline-block rounded-full bg-[#C53030]" title="Absent" />
                          ) : status === 'on_leave' ? (
                            <span className="w-3.5 h-3.5 inline-block rounded-full bg-blue-500" title="On Leave" />
                          ) : status === 'holiday' ? (
                            <span className="w-3.5 h-3.5 inline-block rounded-full bg-purple-500" title="Holiday" />
                          ) : (
                            <span className="text-[10px] text-gray-300">-</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0A0A0A]">
                      {row.totalHoursFormatted}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-[#00805F]">{row.presentCount}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-[#B7791F]">{row.lateCount}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-[#C53030]">{row.absentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: APPROVALS QUEUE */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          {/* 1. Field Punches Queue */}
          <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Pending Field Punches ({todayData?.pendingFieldPunches?.length || 0})
            </h3>
            {todayData?.pendingFieldPunches?.length === 0 ? (
              <p className="text-xs text-[#6B7272]">No field punches pending review.</p>
            ) : (
              <div className="space-y-3">
                {todayData.pendingFieldPunches.map((p: any) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0A0A0A]">{p.profile?.full_name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-semibold uppercase">
                          {p.kind}
                        </span>
                      </div>
                      <p className="text-[#6B7272]">
                        Timestamp: {new Date(p.at).toLocaleString('en-GB')} · Distance: {Math.round(p.distance_m || 0)}m
                      </p>
                      <p className="text-[#0A0A0A] font-medium bg-white p-2 rounded-lg border border-[#E4E7E7]">
                        &quot;{p.note}&quot;
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApproveFieldPunch(p.id, 'approve')}
                        className="h-8 text-xs bg-[#00A57E] hover:bg-[#00805F] text-white gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproveFieldPunch(p.id, 'reject')}
                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Leave Requests Queue */}
          <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Pending Leave Requests ({todayData?.pendingLeaves?.length || 0})
            </h3>
            {todayData?.pendingLeaves?.length === 0 ? (
              <p className="text-xs text-[#6B7272]">No leave requests pending approval.</p>
            ) : (
              <div className="space-y-3">
                {todayData.pendingLeaves.map((l: any) => (
                  <div
                    key={l.id}
                    className="p-4 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0A0A0A]">{l.profile?.full_name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-semibold capitalize">
                          {l.type} Leave
                        </span>
                      </div>
                      <p className="text-[#6B7272]">
                        Period: {l.from_date} to {l.to_date} {l.half_day ? '(Half Day)' : ''}
                      </p>
                      <p className="text-[#0A0A0A] font-medium bg-white p-2 rounded-lg border border-[#E4E7E7]">
                        &quot;{l.reason}&quot;
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApproveLeave(l.id, 'approve')}
                        className="h-8 text-xs bg-[#00A57E] hover:bg-[#00805F] text-white gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproveLeave(l.id, 'reject')}
                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Regularizations Queue */}
          <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Pending Regularization Corrections ({todayData?.pendingRegularizations?.length || 0})
            </h3>
            {todayData?.pendingRegularizations?.length === 0 ? (
              <p className="text-xs text-[#6B7272]">No regularization requests pending approval.</p>
            ) : (
              <div className="space-y-3">
                {todayData.pendingRegularizations.map((r: any) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0A0A0A]">{r.profile?.full_name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 font-semibold">
                          Date: {r.date}
                        </span>
                      </div>
                      <p className="text-[#6B7272]">
                        Requested: {new Date(r.requested_in).toLocaleTimeString('en-GB')} –{' '}
                        {new Date(r.requested_out).toLocaleTimeString('en-GB')}
                      </p>
                      <p className="text-[#0A0A0A] font-medium bg-white p-2 rounded-lg border border-[#E4E7E7]">
                        &quot;{r.reason}&quot;
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApproveRegularization(r.id, 'approve')}
                        className="h-8 text-xs bg-[#00A57E] hover:bg-[#00805F] text-white gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve &amp; Recompute
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproveRegularization(r.id, 'reject')}
                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: OFFICES & GEOFENCING */}
      {activeTab === 'offices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0A0A0A]">
              Offices &amp; Geofenced Locations
            </h2>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setSelectedOffice(null)
                setOfficeModalOpen(true)
              }}
              className="text-xs bg-[#00A57E] hover:bg-[#00805F] text-white gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add Office
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {offices.map((off: any) => (
              <div
                key={off.id}
                className="bg-white rounded-2xl border border-[#E4E7E7] p-5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0A0A0A]">{off.name}</h3>
                    <p className="text-xs text-[#6B7272] mt-0.5">{off.address}</p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      off.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {off.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-[#6B7272] pt-2 border-t border-[#F5F6F6]">
                  <div>
                    <span className="block font-medium">Radius:</span>
                    <span className="font-bold text-[#0A0A0A]">{off.radius_m} meters</span>
                  </div>
                  <div>
                    <span className="block font-medium">Network Match:</span>
                    <span className="font-bold text-[#0A0A0A]">
                      {off.require_network_match ? 'Enforced' : 'Optional'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="block font-medium">Coordinates:</span>
                    <span className="font-mono text-[#0A0A0A]">
                      {Number(off.latitude).toFixed(6)}, {Number(off.longitude).toFixed(6)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedOffice(off)
                      setOfficeModalOpen(true)
                    }}
                    className="text-xs text-[#00A57E] border-[#00A57E]/30 hover:bg-[#E6F6F2]"
                  >
                    Edit Geofence &amp; Map
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Office Dialog */}
      <OfficeDialog
        open={officeModalOpen}
        onOpenChange={setOfficeModalOpen}
        office={selectedOffice}
        onSaved={reloadData}
      />
    </div>
  )
}
