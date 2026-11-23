'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react'
import {
  Calendar as CalendarIcon,
  List,
  PlusCircle,
  Coffee,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar'
import { RequestLeaveDialog } from '@/components/attendance/RequestLeaveDialog'
import { RequestRegularizationDialog } from '@/components/attendance/RequestRegularizationDialog'
import { getMonthAttendanceAction } from './actions'
import { formatWorkedHours } from '@/lib/attendance/utils'

interface AttendanceClientProps {
  initialData: any
}

export function AttendanceClient({ initialData }: AttendanceClientProps) {
  const [data, setData] = useState(initialData)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [regModalOpen, setRegModalOpen] = useState(false)
  const [selectedRegDate, setSelectedRegDate] = useState<string | undefined>(undefined)
  const [selectedDayDetails, setSelectedDayDetails] = useState<any | null>(null)

  const reloadData = async (yearMonth?: string) => {
    const res = await getMonthAttendanceAction(yearMonth || data.yearMonth)
    if (res.success && res.data) {
      setData(res.data)
    }
  }

  const handleMonthChange = (newYm: string) => {
    reloadData(newYm)
  }

  const summary = data.summary || {
    totalWorkedMinutes: 0,
    daysPresent: 0,
    daysLate: 0,
    daysAbsent: 0,
    daysOnLeave: 0,
    avgCheckInTime: '--:--',
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0A0A0A]">My Attendance &amp; Leave</h1>
          <p className="text-xs text-[#6B7272] mt-0.5">
            View monthly logs, check geofenced punch records, and request leave or corrections.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            onClick={() => setLeaveModalOpen(true)}
            variant="outline"
            className="text-xs font-semibold h-9 rounded-xl border-[#E4E7E7] hover:bg-[#F5F6F6] flex-1 sm:flex-none gap-1.5"
          >
            <Coffee className="w-3.5 h-3.5 text-[#00A57E]" />
            Apply Leave
          </Button>

          <Button
            type="button"
            onClick={() => {
              setSelectedRegDate(undefined)
              setRegModalOpen(true)
            }}
            className="text-xs font-semibold h-9 rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white flex-1 sm:flex-none gap-1.5 shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Request Correction
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-[#6B7272] block">Total Worked</span>
          <span className="text-lg font-bold text-[#0A0A0A] font-mono mt-1 block">
            {formatWorkedHours(summary.totalWorkedMinutes)}
          </span>
          <span className="text-[10px] text-[#00A57E] font-medium mt-0.5 block">This Month</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-[#6B7272] block">Days Present</span>
          <span className="text-lg font-bold text-[#00805F] mt-1 block">
            {summary.daysPresent}
          </span>
          <span className="text-[10px] text-[#6B7272] mt-0.5 block">On Duty</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-[#6B7272] block">Late Arrivals</span>
          <span className="text-lg font-bold text-[#B7791F] mt-1 block">
            {summary.daysLate}
          </span>
          <span className="text-[10px] text-amber-700 mt-0.5 block">&gt; Grace period</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-[#6B7272] block">Absences</span>
          <span className="text-lg font-bold text-[#C53030] mt-1 block">
            {summary.daysAbsent}
          </span>
          <span className="text-[10px] text-red-600 mt-0.5 block">Working days</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-[#6B7272] block">On Leave</span>
          <span className="text-lg font-bold text-blue-600 mt-1 block">
            {summary.daysOnLeave}
          </span>
          <span className="text-[10px] text-blue-700 mt-0.5 block">Approved days</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7E7] p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-[#6B7272] block">Avg Check-In</span>
          <span className="text-lg font-bold text-[#0A0A0A] font-mono mt-1 block">
            {summary.avgCheckInTime}
          </span>
          <span className="text-[10px] text-[#6B7272] mt-0.5 block">Asia/Dubai</span>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between border-b border-[#E4E7E7] pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7]">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'calendar'
                ? 'bg-white text-[#0A0A0A] shadow-xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Calendar View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-white text-[#0A0A0A] shadow-xs'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            List View
          </button>
        </div>
      </div>

      {/* Calendar or List View */}
      {viewMode === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <AttendanceCalendar
              yearMonth={data.yearMonth}
              days={data.days}
              holidays={data.holidays}
              leaves={data.leaves}
              onMonthChange={handleMonthChange}
              onSelectDay={(dayRecord, dateStr) => {
                setSelectedDayDetails({ ...dayRecord, dateStr })
              }}
            />
          </div>

          {/* Selected Day Inspector */}
          <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 shadow-xs space-y-4 self-start">
            <h3 className="text-sm font-bold text-[#0A0A0A] pb-2 border-b border-[#F5F6F6]">
              Day Details
            </h3>

            {selectedDayDetails ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#6B7272] block">Date:</span>
                  <span className="font-semibold text-[#0A0A0A] text-sm">
                    {selectedDayDetails.dateStr}
                  </span>
                </div>

                <div>
                  <span className="text-[#6B7272] block">Status:</span>
                  <span className="capitalize font-semibold text-[#00A57E]">
                    {(selectedDayDetails.status || 'Weekly Off').replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[#6B7272] block">First In:</span>
                    <span className="font-mono">
                      {selectedDayDetails.first_in
                        ? new Date(selectedDayDetails.first_in).toLocaleTimeString('en-GB')
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7272] block">Last Out:</span>
                    <span className="font-mono">
                      {selectedDayDetails.last_out
                        ? new Date(selectedDayDetails.last_out).toLocaleTimeString('en-GB')
                        : '—'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[#6B7272] block">Worked Hours:</span>
                  <span className="font-mono font-bold text-[#0A0A0A]">
                    {formatWorkedHours(selectedDayDetails.worked_minutes || 0)}
                  </span>
                </div>

                {selectedDayDetails.late_minutes > 0 && (
                  <div>
                    <span className="text-[#6B7272] block">Late Arrival:</span>
                    <span className="font-mono font-semibold text-[#B7791F]">
                      {selectedDayDetails.late_minutes} minutes
                    </span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRegDate(selectedDayDetails.dateStr)
                    setRegModalOpen(true)
                  }}
                  className="w-full text-xs font-semibold text-[#00A57E] border-[#00A57E]/30 hover:bg-[#E6F6F2] mt-3"
                >
                  Regularize this Day
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[#6B7272] italic">
                Click any calendar date to view punch timestamps and request regularization.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E4E7E7] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5F6F6] border-b border-[#E4E7E7] text-[#6B7272] font-semibold">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">First In</th>
                  <th className="py-3 px-4">Last Out</th>
                  <th className="py-3 px-4">Worked Hours</th>
                  <th className="py-3 px-4">Late</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F6F6]">
                {data.days.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#6B7272]">
                      No attendance days recorded for this month.
                    </td>
                  </tr>
                ) : (
                  data.days.map((day: any) => (
                    <tr key={day.id} className="hover:bg-[#F5F6F6]/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#0A0A0A]">{day.date}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5]">
                          {day.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#6B7272]">
                        {day.first_in ? new Date(day.first_in).toLocaleTimeString('en-GB') : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#6B7272]">
                        {day.last_out ? new Date(day.last_out).toLocaleTimeString('en-GB') : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#0A0A0A]">
                        {formatWorkedHours(day.worked_minutes)}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {day.late_minutes > 0 ? (
                          <span className="text-amber-700 font-semibold">{day.late_minutes}m</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRegDate(day.date)
                            setRegModalOpen(true)
                          }}
                          className="h-7 text-xs text-[#00A57E] hover:text-[#00805F] hover:bg-[#E6F6F2]"
                        >
                          Regularize
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Request Dialog */}
      <RequestLeaveDialog
        open={leaveModalOpen}
        onOpenChange={setLeaveModalOpen}
        onSubmitted={() => reloadData()}
        weeklyOff={data.settings?.weekly_off ?? [0]}
        holidays={data.holidays ?? []}
      />

      {/* Regularization Request Dialog */}
      <RequestRegularizationDialog
        open={regModalOpen}
        onOpenChange={setRegModalOpen}
        defaultDate={selectedRegDate}
        onSubmitted={() => reloadData()}
      />
    </div>
  )
}
