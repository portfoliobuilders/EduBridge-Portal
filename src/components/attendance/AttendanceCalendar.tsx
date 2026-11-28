'use client'

import React, { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { formatWorkedHours } from '@/lib/attendance/utils'

interface AttendanceCalendarProps {
  yearMonth: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  days: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  holidays: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaves: any[]
  weeklyOff?: number[]
  onMonthChange: (newYm: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectDay?: (dayRecord: any, dateStr: string) => void
}

export function AttendanceCalendar({
  yearMonth,
  days,
  holidays,
  weeklyOff = [5],
  onMonthChange,
  onSelectDay,
}: AttendanceCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [yStr, mStr] = yearMonth.split('-')
  const year = parseInt(yStr, 10)
  const month = parseInt(mStr, 10) // 1-indexed (1..12)

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  const daysInMonth = new Date(year, month, 0).getDate()
  // Day of week of 1st day of month: 0 = Sun, 1 = Mon ...
  const firstDayDow = new Date(year, month - 1, 1).getDay()

  // Map days by date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const daysMap = new Map(days.map((d: any) => [d.date, d]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holidaysMap = new Map(holidays.map((h: any) => [h.date, h]))

  const handlePrevMonth = () => {
    const prev = new Date(year, month - 2, 1)
    const newYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    onMonthChange(newYm)
  }

  const handleNextMonth = () => {
    const next = new Date(year, month, 1)
    const newYm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    onMonthChange(newYm)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200'
      case 'late':
        return 'bg-amber-50 text-amber-800 border-amber-300'
      case 'half_day':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200'
      case 'absent':
        return 'bg-red-50 text-red-800 border-red-300'
      case 'on_leave':
        return 'bg-blue-50 text-blue-800 border-blue-200'
      case 'holiday':
        return 'bg-purple-50 text-purple-800 border-purple-200'
      case 'missing_checkout':
        return 'bg-orange-50 text-orange-800 border-orange-300'
      case 'weekly_off':
        return 'bg-[#F5F6F6] text-[#6B7272] border-[#E4E7E7]'
      default:
        return 'bg-white text-gray-500 border-gray-200'
    }
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-[#00A57E]'
      case 'late':
        return 'bg-[#B7791F]'
      case 'half_day':
        return 'bg-yellow-500'
      case 'absent':
        return 'bg-[#C53030]'
      case 'on_leave':
        return 'bg-blue-500'
      case 'holiday':
        return 'bg-purple-500'
      case 'missing_checkout':
        return 'bg-orange-500'
      default:
        return 'bg-gray-300'
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-[#00A57E]" />
          <h2 className="text-base font-bold text-[#0A0A0A]">
            {monthNames[month - 1]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg border border-[#E4E7E7] hover:bg-[#F5F6F6] text-gray-700 transition"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg border border-[#E4E7E7] hover:bg-[#F5F6F6] text-gray-700 transition"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs pt-1 pb-2 border-b border-[#F5F6F6]">
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00A57E]" /> Present
        </span>
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-[#B7791F]" /> Late
        </span>
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-[#C53030]" /> Absent
        </span>
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> On Leave
        </span>
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Holiday
        </span>
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Missing Check-Out
        </span>
      </div>

      {/* Day of Week Headers */}
      <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-[#6B7272]">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {/* Empty cells before month 1st day */}
        {Array.from({ length: firstDayDow }).map((_, idx) => (
          <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-xl bg-transparent" />
        ))}

        {/* Days of month */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNum = idx + 1
          const dateStr = `${yearMonth}-${String(dayNum).padStart(2, '0')}`
          const dayRecord = daysMap.get(dateStr)
          const holiday = holidaysMap.get(dateStr)

          const dateObj = new Date(year, month - 1, dayNum)
          const dow = dateObj.getDay()
          const isOff = weeklyOff.includes(dow)

          const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Dubai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date())

          let status = 'pending'
          if (holiday) {
            status = 'holiday'
          } else if (dayRecord?.status) {
            status = dayRecord.status
          } else if (isOff) {
            status = 'weekly_off'
          } else if (dateStr > todayStr) {
            status = 'pending'
          } else {
            status = 'absent'
          }

          const isSelected = selectedDate === dateStr

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => {
                setSelectedDate(dateStr)
                if (onSelectDay) {
                  const effectiveRecord = dayRecord || {
                    date: dateStr,
                    status,
                    worked_minutes: 0,
                    late_minutes: 0,
                  }
                  onSelectDay(effectiveRecord, dateStr)
                }
              }}
              className={`h-16 sm:h-20 p-1.5 sm:p-2 rounded-xl border text-left transition-all flex flex-col justify-between ${getStatusColor(
                status
              )} ${isSelected ? 'ring-2 ring-[#00A57E] shadow-sm' : 'hover:opacity-90'}`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-xs sm:text-sm">{dayNum}</span>
                <span className={`w-2 h-2 rounded-full ${getStatusDot(status)}`} />
              </div>

              <div className="text-[10px] truncate leading-tight">
                {holiday ? (
                  <span className="font-semibold">{holiday.name}</span>
                ) : dayRecord?.worked_minutes > 0 ? (
                  <span className="font-mono font-medium">
                    {formatWorkedHours(dayRecord.worked_minutes)}
                  </span>
                ) : (
                  <span className="capitalize">{status.replace('_', ' ')}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
