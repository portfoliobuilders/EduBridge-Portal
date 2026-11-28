'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { getDubaiDateString, formatWorkedHours } from '@/lib/attendance/utils'

/**
 * Fetches the Today Board metrics and lists for Admin Console.
 */
export async function getAdminTodayBoardAction() {
  try {
    const [{ user, profile: callerProfile }, supabase] = await Promise.all([
      getUserProfile(),
      createClient(),
    ])

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const todayStr = getDubaiDateString(new Date())
    const sinceIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

    const visiblePromise =
      callerProfile?.role === 'admin'
        ? supabase.rpc('visible_user_ids')
        : Promise.resolve({ data: null })

    const [
      visibleRes,
      { data: allActiveStaff },
      { data: settingsList },
      { data: todayDays },
      { data: recentPunches },
      { data: pendingFieldPunches },
      { data: pendingLeaves },
      { data: pendingRegularizations },
    ] = await Promise.all([
      visiblePromise,
      supabase
        .from('profiles')
        .select('id, full_name, display_name, role, job_title, avatar_url, is_active')
        .eq('is_active', true)
        .order('full_name', { ascending: true }),
      supabase.from('staff_attendance_settings').select('*, office:offices(*)'),
      supabase.from('attendance_days').select('*').eq('date', todayStr),
      supabase
        .from('attendance_punches')
        .select('*, profile:profiles(full_name, avatar_url)')
        .gte('at', sinceIso)
        .order('at', { ascending: false }),
      supabase
        .from('attendance_punches')
        .select('*, profile:profiles(full_name, avatar_url), office:offices(name)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false }),
      supabase
        .from('leave_requests')
        .select('*, profile:profiles(full_name, avatar_url)')
        .eq('status', 'requested')
        .order('created_at', { ascending: false }),
      supabase
        .from('regularization_requests')
        .select('*, profile:profiles(full_name, avatar_url)')
        .eq('status', 'requested')
        .order('created_at', { ascending: false }),
    ])

    let staffList = allActiveStaff || []
    if (callerProfile?.role === 'admin') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allowedSet = new Set((visibleRes.data || []).map((r: any) => r.user_id))
      staffList = staffList.filter((s) => allowedSet.has(s.id))
    }

    // Filter Dubai today
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayPunches = (recentPunches || []).filter((p: any) => {
      return getDubaiDateString(new Date(p.at)) === todayStr
    })

    // Flagged punches today (accuracy_high, impossible_travel, new_device)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flaggedPunches = todayPunches.filter((p: any) => p.flags && p.flags.length > 0)

    // Group staff into statuses
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const daysMap = new Map((todayDays || []).map((d: any) => [d.user_id, d]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsMap = new Map((settingsList || []).map((s: any) => [s.user_id, s]))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inList: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lateList: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notYetInList: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLeaveList: any[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ; (staffList || []).forEach((staff: any) => {
        const setting = settingsMap.get(staff.id)
        if (setting && setting.attendance_required === false) {
          return // Excluded e.g. super_admin/owner
        }

        const day = daysMap.get(staff.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userPunches = todayPunches.filter((p: any) => p.user_id === staff.id && p.status === 'accepted')
        const lastPunch = userPunches.length > 0 ? userPunches[0] : null
        const isCurrentlyIn = lastPunch?.kind === 'in'

        const item = {
          ...staff,
          day,
          setting,
          lastPunch,
          isCurrentlyIn,
        }

        if (day?.status === 'on_leave') {
          onLeaveList.push(item)
        } else if (isCurrentlyIn || day?.status === 'present') {
          inList.push(item)
          if (day?.late_minutes > 0 || day?.status === 'late') {
            lateList.push(item)
          }
        } else if (day?.status === 'late') {
          lateList.push(item)
          inList.push(item)
        } else {
          notYetInList.push(item)
        }
      })

    // Check staff with attendance_required = true but missing shift, office, or weekly-off
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unassignedStaff: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ; (staffList || []).forEach((staff: any) => {
        const setting = settingsMap.get(staff.id)
        const isReq = setting ? setting.attendance_required !== false : (staff.role !== 'super_admin' && staff.role !== 'owner')
        if (isReq) {
          if (!setting || !setting.office_id || !setting.shift_start || !setting.weekly_off || setting.weekly_off.length === 0) {
            unassignedStaff.push({
              id: staff.id,
              full_name: staff.full_name,
              missing: [
                (!setting || !setting.office_id) ? 'office' : null,
                (!setting || !setting.shift_start) ? 'shift' : null,
                (!setting || !setting.weekly_off || setting.weekly_off.length === 0) ? 'weekly-off' : null,
              ].filter(Boolean),
            })
          }
        }
      })

    return {
      success: true,
      data: {
        todayStr,
        unassignedStaff,
        counts: {
          totalStaff: staffList?.length || 0,
          in: inList.length,
          late: lateList.length,
          notYetIn: notYetInList.length,
          onLeave: onLeaveList.length,
          pendingFieldPunches: pendingFieldPunches?.length || 0,
          pendingLeaves: pendingLeaves?.length || 0,
          pendingRegularizations: pendingRegularizations?.length || 0,
          flaggedPunches: flaggedPunches.length,
        },
        inList,
        lateList,
        notYetInList,
        onLeaveList,
        pendingFieldPunches: pendingFieldPunches || [],
        pendingLeaves: pendingLeaves || [],
        pendingRegularizations: pendingRegularizations || [],
        flaggedPunches,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch admin today board'
    return { success: false, error: message }
  }
}

/**
 * Fetches Team Monthly Attendance Matrix (Staff × Days).
 */
export async function getAdminTeamMonthlySheetAction(yearMonth?: string) {
  try {
    const [{ user, profile: callerProfile }, supabase] = await Promise.all([
      getUserProfile(),
      createClient(),
    ])

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const ym = yearMonth || getDubaiDateString().substring(0, 7)
    const startDate = `${ym}-01`
    const endDate = `${ym}-31`

    const visiblePromise =
      callerProfile?.role === 'admin'
        ? supabase.rpc('visible_user_ids')
        : Promise.resolve({ data: null })

    const [visibleRes, { data: allActiveStaff }, { data: days }, { data: holidays }] =
      await Promise.all([
        visiblePromise,
        supabase
          .from('profiles')
          .select('id, full_name, display_name, job_title, avatar_url')
          .eq('is_active', true)
          .order('full_name', { ascending: true }),
        supabase
          .from('attendance_days')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('holidays')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate),
      ])

    let staffList = allActiveStaff || []
    if (callerProfile?.role === 'admin') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allowedSet = new Set((visibleRes.data || []).map((r: any) => r.user_id))
      staffList = staffList.filter((s) => allowedSet.has(s.id))
    }

    // Calculate days in month
    const [yStr, mStr] = ym.split('-')
    const y = parseInt(yStr, 10)
    const m = parseInt(mStr, 10)
    const daysInMonth = new Date(y, m, 0).getDate()

    // Build map: staffId -> { [dateStr]: dayRecord, totalMinutes }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matrix: any[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ; (staffList || []).forEach((staff: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const staffDays = (days || []).filter((d: any) => d.user_id === staff.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dayMap: Record<string, any> = {}
        let totalMinutes = 0
        let presentCount = 0
        let lateCount = 0
        let absentCount = 0
        let leaveCount = 0

        staffDays.forEach((d) => {
          dayMap[d.date] = d
          totalMinutes += d.worked_minutes || 0
          if (d.status === 'present') presentCount++
          if (d.status === 'late') {
            presentCount++
            lateCount++
          }
          if (d.status === 'absent') absentCount++
          if (d.status === 'on_leave') leaveCount++
        })

        matrix.push({
          staff,
          dayMap,
          totalMinutes,
          totalHoursFormatted: formatWorkedHours(totalMinutes),
          presentCount,
          lateCount,
          absentCount,
          leaveCount,
        })
      })

    return {
      success: true,
      data: {
        yearMonth: ym,
        daysInMonth,
        holidays: holidays || [],
        matrix,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch team monthly sheet'
    return { success: false, error: message }
  }
}

/**
 * Offices CRUD
 */
export async function getOfficesAction() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('offices').select('*').order('name', { ascending: true })
    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load offices' }
  }
}

export async function saveOfficeAction(officeData: {
  id?: string
  name: string
  address: string
  latitude: number
  longitude: number
  radius_m: number
  allowed_public_ips: string[]
  require_network_match: boolean
  is_active?: boolean
}) {
  try {
    const supabase = await createClient()

    if (officeData.radius_m < 30 || officeData.radius_m > 1000) {
      return { success: false, error: 'Radius must be between 30m and 1000m' }
    }

    if (officeData.id) {
      const { data, error } = await supabase
        .from('offices')
        .update({
          name: officeData.name,
          address: officeData.address,
          latitude: officeData.latitude,
          longitude: officeData.longitude,
          radius_m: officeData.radius_m,
          allowed_public_ips: officeData.allowed_public_ips || [],
          require_network_match: officeData.require_network_match,
          is_active: officeData.is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', officeData.id)
        .select()
        .single()

      if (error) return { success: false, error: error.message }
      revalidatePath('/admin/attendance')
      revalidatePath('/admin/settings')
      return { success: true, data }
    } else {
      const { data, error } = await supabase
        .from('offices')
        .insert({
          name: officeData.name,
          address: officeData.address,
          latitude: officeData.latitude,
          longitude: officeData.longitude,
          radius_m: officeData.radius_m,
          allowed_public_ips: officeData.allowed_public_ips || [],
          require_network_match: officeData.require_network_match,
          is_active: officeData.is_active ?? true,
        })
        .select()
        .single()

      if (error) return { success: false, error: error.message }
      revalidatePath('/admin/attendance')
      revalidatePath('/admin/settings')
      return { success: true, data }
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save office' }
  }
}

export async function deleteOfficeAction(officeId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('offices').update({ is_active: false }).eq('id', officeId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/attendance')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to deactivate office' }
  }
}

/**
 * Holidays CRUD
 */
export async function getHolidaysAction(year?: number) {
  try {
    const supabase = await createClient()
    const y = year || new Date().getFullYear()
    const { data, error } = await supabase
      .from('holidays')
      .select('*, office:offices(name)')
      .gte('date', `${y}-01-01`)
      .lte('date', `${y}-12-31`)
      .order('date', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load holidays' }
  }
}

export async function saveHolidayAction(data: { id?: string; date: string; name: string; office_id?: string | null; half_day?: boolean }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (data.id) {
      const { error } = await supabase
        .from('holidays')
        .update({
          date: data.date,
          name: data.name,
          office_id: data.office_id || null,
          half_day: Boolean(data.half_day),
        })
        .eq('id', data.id)
      if (error) return { success: false, error: error.message }
    } else {
      const { error } = await supabase.from('holidays').insert({
        date: data.date,
        name: data.name,
        office_id: data.office_id || null,
        half_day: Boolean(data.half_day),
        created_by: user?.id,
      })
      if (error) return { success: false, error: error.message }
    }

    revalidatePath('/admin/attendance')
    revalidatePath('/admin/settings')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save holiday' }
  }
}

export async function deleteHolidayAction(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/attendance')
    revalidatePath('/admin/settings')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete holiday' }
  }
}

/**
 * Generate and export CSV for payroll / attendance reporting.
 */
export async function exportAttendanceCsvAction(options: {
  type: 'daily' | 'monthly'
  date?: string
  yearMonth?: string
}) {
  try {
    if (options.type === 'daily') {
      const boardRes = await getAdminTodayBoardAction()
      if (!boardRes.success || !boardRes.data) {
        return { success: false, error: 'Failed to fetch daily data' }
      }

      const rows: string[] = []
      rows.push(['Staff Name', 'Role', 'Job Title', 'Status', 'First In', 'Last Out', 'Worked Hours', 'Late (Mins)'].join(','))

      const allItems = [
        ...boardRes.data.inList,
        ...boardRes.data.notYetInList,
        ...boardRes.data.onLeaveList,
      ]

      allItems.forEach((item) => {
        const name = `"${(item.full_name || '').replace(/"/g, '""')}"`
        const role = item.role || ''
        const title = `"${(item.job_title || '').replace(/"/g, '""')}"`
        const status = item.day?.status || (item.isCurrentlyIn ? 'in' : 'not_in')
        const firstIn = item.day?.first_in ? new Date(item.day.first_in).toLocaleTimeString('en-GB') : ''
        const lastOut = item.day?.last_out ? new Date(item.day.last_out).toLocaleTimeString('en-GB') : ''
        const hours = formatWorkedHours(item.day?.worked_minutes || 0)
        const late = item.day?.late_minutes || 0

        rows.push([name, role, title, status, firstIn, lastOut, hours, late].join(','))
      })

      return {
        success: true,
        filename: `EduBridge-Attendance-${options.date || getDubaiDateString()}.csv`,
        csv: rows.join('\n'),
      }
    } else {
      const sheetRes = await getAdminTeamMonthlySheetAction(options.yearMonth)
      if (!sheetRes.success || !sheetRes.data) {
        return { success: false, error: 'Failed to fetch monthly data' }
      }

      const daysCount = sheetRes.data.daysInMonth
      const header = ['Staff Name', 'Job Title']
      for (let i = 1; i <= daysCount; i++) {
        header.push(`Day ${i}`)
      }
      header.push('Total Hours', 'Days Present', 'Days Late', 'Days Absent', 'Days On Leave')

      const rows: string[] = [header.join(',')]
      const ym = sheetRes.data.yearMonth

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheetRes.data.matrix.forEach((row: any) => {
        const staffName = `"${(row.staff.full_name || '').replace(/"/g, '""')}"`
        const jobTitle = `"${(row.staff.job_title || '').replace(/"/g, '""')}"`
        const dayCols: string[] = []

        for (let i = 1; i <= daysCount; i++) {
          const dateStr = `${ym}-${String(i).padStart(2, '0')}`
          const dRecord = row.dayMap[dateStr]
          dayCols.push(dRecord?.status || '-')
        }

        const line = [
          staffName,
          jobTitle,
          ...dayCols,
          `"${row.totalHoursFormatted}"`,
          row.presentCount,
          row.lateCount,
          row.absentCount,
          row.leaveCount,
        ]
        rows.push(line.join(','))
      })

      return {
        success: true,
        filename: `EduBridge-Payroll-Attendance-${ym}.csv`,
        csv: rows.join('\n'),
      }
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'CSV export failed' }
  }
}
