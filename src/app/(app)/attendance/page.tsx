import React from 'react'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { AttendanceClient } from './AttendanceClient'
import { getMonthAttendanceAction } from './actions'

export const metadata: Metadata = {
  title: 'Attendance & Leave',
}

export default async function AttendancePage() {
  const { profile } = await requireUser()
  const res = await getMonthAttendanceAction(undefined, profile.id)

  const initialData = res.success
    ? res.data
    : {
        yearMonth: new Date().toISOString().substring(0, 7),
        days: [],
        leaves: [],
        regularizations: [],
        holidays: [],
        summary: {
          totalWorkedMinutes: 0,
          daysPresent: 0,
          daysLate: 0,
          daysAbsent: 0,
          daysOnLeave: 0,
          avgCheckInTime: '--:--',
        },
      }

  return <AttendanceClient initialData={initialData} />
}
