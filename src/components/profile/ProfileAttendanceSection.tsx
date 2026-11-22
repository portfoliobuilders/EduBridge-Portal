'use client'

import React, { useState } from 'react'
import { Clock } from 'lucide-react'
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar'
import { getMonthAttendanceAction } from '@/app/(app)/attendance/actions'
import { formatWorkedHours } from '@/lib/attendance/utils'

interface ProfileAttendanceSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData: any
  userId: string
}

export function ProfileAttendanceSection({ initialData, userId }: ProfileAttendanceSectionProps) {
  const [data, setData] = useState(initialData)

  const handleMonthChange = async (newYm: string) => {
    const res = await getMonthAttendanceAction(newYm, userId)
    if (res.success && res.data) {
      setData(res.data)
    }
  }

  const summary = data?.summary || {
    totalWorkedMinutes: 0,
    daysPresent: 0,
    daysLate: 0,
    daysAbsent: 0,
    daysOnLeave: 0,
    avgCheckInTime: '--:--',
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#E4E7E7]">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#00A57E]" />
          <h2 className="text-base font-bold text-[#0A0A0A]">Attendance &amp; Hours Ledger</h2>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5]">
          This Month
        </span>
      </div>

      {/* Totals Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7]">
          <span className="text-[11px] text-[#6B7272] block">Total Worked</span>
          <span className="text-base font-bold text-[#0A0A0A] font-mono mt-0.5 block">
            {formatWorkedHours(summary.totalWorkedMinutes)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7]">
          <span className="text-[11px] text-[#6B7272] block">Days Present</span>
          <span className="text-base font-bold text-[#00805F] mt-0.5 block">
            {summary.daysPresent}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7]">
          <span className="text-[11px] text-[#6B7272] block">Late Arrivals</span>
          <span className="text-base font-bold text-[#B7791F] mt-0.5 block">
            {summary.daysLate}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7]">
          <span className="text-[11px] text-[#6B7272] block">Avg Check-In</span>
          <span className="text-base font-bold text-[#0A0A0A] font-mono mt-0.5 block">
            {summary.avgCheckInTime}
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div className="pt-2">
        <AttendanceCalendar
          yearMonth={data.yearMonth}
          days={data.days}
          holidays={data.holidays}
          leaves={data.leaves}
          onMonthChange={handleMonthChange}
        />
      </div>
    </div>
  )
}
