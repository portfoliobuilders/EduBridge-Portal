import React from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { AttendanceClient } from './AttendanceClient'
import { getMonthAttendanceAction } from './actions'
import {
  getAdminTodayBoardAction,
  getAdminTeamMonthlySheetAction,
  getOfficesAction,
} from '@/app/(app)/admin/attendance/actions'

export const metadata: Metadata = {
  title: 'Attendance & Leave',
}

export default async function AttendancePage() {
  const { profile } = await requireUser()

  // super_admin: sidebar and page redirect to team view (/admin/attendance)
  if (profile.role === 'super_admin' || profile.role === 'owner') {
    redirect('/admin/attendance')
  }

  const isAdmin = profile.role === 'admin'

  const [res, todayRes, sheetRes, officesRes] = await Promise.all([
    getMonthAttendanceAction(undefined, profile.id),
    isAdmin ? getAdminTodayBoardAction() : Promise.resolve(null),
    isAdmin ? getAdminTeamMonthlySheetAction() : Promise.resolve(null),
    isAdmin ? getOfficesAction() : Promise.resolve(null),
  ])

  const initialData = res.success
    ? res.data
    : {
      yearMonth: new Date().toISOString().substring(0, 7),
      days: [],
      leaves: [],
      regularizations: [],
      holidays: [],
      settings: { weekly_off: [5] },
      summary: {
        totalWorkedMinutes: 0,
        daysPresent: 0,
        daysLate: 0,
        daysAbsent: 0,
        daysOnLeave: 0,
        avgCheckInTime: '--:--',
      },
    }

  const adminTodayData = todayRes?.success ? todayRes.data : null
  const adminSheetData = sheetRes?.success ? sheetRes.data : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offices: any[] = officesRes?.success ? officesRes.data || [] : []

  return (
    <AttendanceClient
      initialData={initialData}
      isAdmin={profile.role === 'admin'}
      adminTodayData={adminTodayData}
      adminSheetData={adminSheetData}
      offices={offices}
    />
  )
}
