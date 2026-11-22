import React from 'react'
import type { Metadata } from 'next'
import { requireAdminOrAbove } from '@/lib/auth'
import { AdminAttendanceClient } from './AdminAttendanceClient'
import {
  getAdminTodayBoardAction,
  getAdminTeamMonthlySheetAction,
  getOfficesAction,
} from './actions'

export const metadata: Metadata = {
  title: 'Workforce & Attendance',
}

export default async function AdminAttendancePage() {
  await requireAdminOrAbove()

  const [todayRes, sheetRes, officesRes] = await Promise.all([
    getAdminTodayBoardAction(),
    getAdminTeamMonthlySheetAction(),
    getOfficesAction(),
  ])

  return (
    <AdminAttendanceClient
      initialTodayData={todayRes.success ? todayRes.data : null}
      initialSheetData={sheetRes.success ? sheetRes.data : null}
      offices={officesRes.success ? officesRes.data || [] : []}
    />
  )
}
