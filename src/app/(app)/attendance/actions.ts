'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDubaiDateString } from '@/lib/attendance/utils'

export interface PunchPayload {
  kind: 'in' | 'out'
  lat: number
  lng: number
  accuracy?: number
  note?: string
  deviceHash?: string
  clientTime?: string
}

/**
 * Server Action for executing a geofenced GPS punch.
 * Extracts client IP securely from x-forwarded-for header.
 */
export async function punchAction(payload: PunchPayload) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const headerList = await headers()
    const forwardedFor = headerList.get('x-forwarded-for')
    // First IP in comma-separated list is the client IP on Vercel
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1'

    const { data, error } = await supabase.rpc('punch', {
      p_kind: payload.kind,
      p_lat: payload.lat,
      p_lng: payload.lng,
      p_accuracy: payload.accuracy ?? undefined,
      p_note: payload.note ?? undefined,
      p_device_hash: payload.deviceHash ?? undefined,
      p_client_time: payload.clientTime ?? undefined,
      p_client_ip: clientIp,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const res = data as {
      success: boolean
      error?: string
      status?: string
      punch_id?: string
      distance_m?: number
      inside_geofence?: boolean
      network_match?: boolean
      flags?: string[]
      at?: string
    }

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Punch rejected',
        distance_m: res.distance_m,
        status: res.status,
      }
    }

    revalidatePath('/')
    revalidatePath('/attendance')
    revalidatePath('/profile')
    revalidatePath('/admin/attendance')

    return {
      success: true,
      data: res,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record punch'
    return { success: false, error: message }
  }
}

/**
 * Gets attendance status for the current user today.
 */
export async function getTodayAttendanceStatusAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' }
    }

    const todayStr = getDubaiDateString(new Date())

    // 1. Staff settings & office
    const { data: settings } = await supabase
      .from('staff_attendance_settings')
      .select('*, office:offices(*)')
      .eq('user_id', user.id)
      .maybeSingle()

    // 2. Today's punches
    const { data: punches } = await supabase
      .from('attendance_punches')
      .select('*')
      .eq('user_id', user.id)
      .order('at', { ascending: true })

    // Filter today's punches in Dubai timezone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayPunches = (punches || []).filter((p: any) => {
      const punchDubaiDate = getDubaiDateString(new Date(p.at))
      return punchDubaiDate === todayStr
    })

    // 3. Today's attendance day record
    const { data: dayRecord } = await supabase
      .from('attendance_days')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', todayStr)
      .maybeSingle()

    // Calculate current status & session
    const acceptedPunches = todayPunches.filter((p) => p.status === 'accepted')
    const lastAccepted = acceptedPunches.length > 0 ? acceptedPunches[acceptedPunches.length - 1] : null
    const isPunchedIn = lastAccepted?.kind === 'in'

    return {
      success: true,
      data: {
        todayStr,
        isPunchedIn,
        lastPunch: lastAccepted,
        todayPunches,
        dayRecord,
        settings,
        office: settings?.office,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch status'
    return { success: false, error: message }
  }
}

/**
 * Gets monthly attendance records for calendar & summary.
 */
export async function getMonthAttendanceAction(yearMonth?: string, targetUserId?: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' }
    }

    const uid = targetUserId || user.id
    const ym = yearMonth || getDubaiDateString().substring(0, 7) // 'YYYY-MM'
    const startDate = `${ym}-01`
    const endDate = `${ym}-31`

    // Attendance days
    const { data: days, error: daysError } = await supabase
      .from('attendance_days')
      .select('*')
      .eq('user_id', uid)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (daysError) {
      return { success: false, error: daysError.message }
    }

    // Leave requests in month
    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', uid)
      .or(`from_date.gte.${startDate},to_date.lte.${endDate}`)
      .order('created_at', { ascending: false })

    // Regularization requests
    const { data: regularizations } = await supabase
      .from('regularization_requests')
      .select('*')
      .eq('user_id', uid)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('created_at', { ascending: false })

    // Holidays
    const { data: holidays } = await supabase
      .from('holidays')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)

    // Compute totals
    let totalWorkedMinutes = 0
    let daysPresent = 0
    let daysLate = 0
    let daysAbsent = 0
    let daysOnLeave = 0
    let firstInMinutesSum = 0
    let checkInCount = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(days || []).forEach((d: any) => {
      totalWorkedMinutes += d.worked_minutes || 0
      if (d.status === 'present') daysPresent++
      if (d.status === 'late') {
        daysPresent++
        daysLate++
      }
      if (d.status === 'absent') daysAbsent++
      if (d.status === 'on_leave') daysOnLeave++

      if (d.first_in) {
        const dObj = new Date(d.first_in)
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Dubai',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
        }).formatToParts(dObj)
        const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
        const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
        firstInMinutesSum += h * 60 + m
        checkInCount++
      }
    })

    const avgCheckInMinutes = checkInCount > 0 ? Math.round(firstInMinutesSum / checkInCount) : null
    const avgCheckInTime =
      avgCheckInMinutes !== null
        ? `${String(Math.floor(avgCheckInMinutes / 60)).padStart(2, '0')}:${String(
            avgCheckInMinutes % 60
          ).padStart(2, '0')}`
        : '--:--'

    return {
      success: true,
      data: {
        yearMonth: ym,
        days: days || [],
        leaves: leaves || [],
        regularizations: regularizations || [],
        holidays: holidays || [],
        summary: {
          totalWorkedMinutes,
          daysPresent,
          daysLate,
          daysAbsent,
          daysOnLeave,
          avgCheckInTime,
        },
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch month attendance'
    return { success: false, error: message }
  }
}

/**
 * Submit a leave request.
 */
export async function submitLeaveRequestAction(formData: {
  type: 'annual' | 'sick' | 'unpaid' | 'other'
  fromDate: string
  toDate: string
  halfDay?: boolean
  reason: string
}) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' }
    }

    if (!formData.reason || formData.reason.trim().length < 3) {
      return { success: false, error: 'Reason must be at least 3 characters.' }
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        user_id: user.id,
        type: formData.type,
        from_date: formData.fromDate,
        to_date: formData.toDate,
        half_day: Boolean(formData.halfDay),
        reason: formData.reason.trim(),
        status: 'requested',
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // Notify admins
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin', 'owner'])
      .eq('is_active', true)

    if (admins && admins.length > 0) {
      for (const adm of admins) {
        await supabase.rpc('create_notification', {
          p_user_id: adm.id,
          p_type: 'leave_request',
          p_title: 'New Leave Request',
          p_body: `${profile?.full_name || 'Staff'} requested ${formData.type} leave (${formData.fromDate} to ${formData.toDate}).`,
          p_link: '/admin/attendance',
          p_entity_type: 'leave_request',
          p_entity_id: data.id,
        })
      }
    }

    revalidatePath('/attendance')
    revalidatePath('/admin/attendance')
    return { success: true, data }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit leave request'
    return { success: false, error: message }
  }
}

/**
 * Submit an attendance regularization request.
 */
export async function submitRegularizationAction(formData: {
  date: string
  requestedIn: string // ISO string or timestamptz
  requestedOut: string
  reason: string
}) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' }
    }

    if (!formData.reason || formData.reason.trim().length < 3) {
      return { success: false, error: 'Reason must be at least 3 characters.' }
    }

    const { data, error } = await supabase
      .from('regularization_requests')
      .insert({
        user_id: user.id,
        date: formData.date,
        requested_in: formData.requestedIn,
        requested_out: formData.requestedOut,
        reason: formData.reason.trim(),
        status: 'requested',
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // Notify admins
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin', 'owner'])
      .eq('is_active', true)

    if (admins && admins.length > 0) {
      for (const adm of admins) {
        await supabase.rpc('create_notification', {
          p_user_id: adm.id,
          p_type: 'regularization_request',
          p_title: 'Attendance Correction Request',
          p_body: `${profile?.full_name || 'Staff'} submitted an attendance regularization for ${formData.date}.`,
          p_link: '/admin/attendance',
          p_entity_type: 'regularization_request',
          p_entity_id: data.id,
        })
      }
    }

    revalidatePath('/attendance')
    revalidatePath('/admin/attendance')
    return { success: true, data }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit regularization'
    return { success: false, error: message }
  }
}

/**
 * Admin action: Approve / Reject field punch
 */
export async function approveFieldPunchAction(punchId: string, action: 'approve' | 'reject', reason?: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('approve_field_punch', {
      p_punch_id: punchId,
      p_action: action,
      p_reason: reason || undefined,
    })

    if (error) return { success: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(data as any)?.success) return { success: false, error: (data as any)?.error }

    revalidatePath('/attendance')
    revalidatePath('/admin/attendance')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Action failed' }
  }
}

/**
 * Admin action: Approve / Reject leave request
 */
export async function approveLeaveAction(requestId: string, action: 'approve' | 'reject', reason?: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('approve_leave_request', {
      p_request_id: requestId,
      p_action: action,
      p_reason: reason || undefined,
    })

    if (error) return { success: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(data as any)?.success) return { success: false, error: (data as any)?.error }

    revalidatePath('/attendance')
    revalidatePath('/admin/attendance')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Action failed' }
  }
}

/**
 * Admin action: Approve / Reject regularization request
 */
export async function approveRegularizationAction(requestId: string, action: 'approve' | 'reject', reason?: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('approve_regularization', {
      p_request_id: requestId,
      p_action: action,
      p_reason: reason || undefined,
    })

    if (error) return { success: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(data as any)?.success) return { success: false, error: (data as any)?.error }

    revalidatePath('/attendance')
    revalidatePath('/admin/attendance')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Action failed' }
  }
}
