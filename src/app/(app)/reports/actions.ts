'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function fetchDashboardKpisAction(params: {
  from: string
  to: string
  staffId?: string | null
}): Promise<ActionResult<Record<string, unknown>>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('dashboard_kpis', {
      p_from: params.from,
      p_to: params.to,
      p_staff_id: params.staffId || undefined,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Record<string, unknown> }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard KPIs'
    return { success: false, error: msg }
  }
}

export async function fetchCollectionsReportAction(params: {
  from: string
  to: string
  staffId?: string | null
  mode?: string | null
  purpose?: string | null
  universityId?: string | null
  courseId?: string | null
}): Promise<ActionResult<Record<string, unknown>>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('report_collections', {
      p_from: params.from,
      p_to: params.to,
      p_staff_id: params.staffId || undefined,
      p_mode: params.mode || undefined,
      p_purpose: params.purpose || undefined,
      p_university_id: params.universityId || undefined,
      p_course_id: params.courseId || undefined,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Record<string, unknown> }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch collections report'
    return { success: false, error: msg }
  }
}

export async function fetchOutstandingReportAction(params: {
  staffId?: string | null
  universityId?: string | null
  courseId?: string | null
  minBalance?: number
}): Promise<ActionResult<Record<string, unknown>>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('report_outstanding', {
      p_staff_id: params.staffId || undefined,
      p_university_id: params.universityId || undefined,
      p_course_id: params.courseId || undefined,
      p_min_balance: params.minBalance ?? 0,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Record<string, unknown> }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch outstanding balances report'
    return { success: false, error: msg }
  }
}

export async function fetchDayEndReportAction(params: {
  date: string
  staffId?: string | null
}): Promise<ActionResult<Record<string, unknown>>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('report_dayend', {
      p_date: params.date,
      p_staff_id: params.staffId || undefined,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Record<string, unknown> }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch day-end cash report'
    return { success: false, error: msg }
  }
}

export async function fetchVoidsReportAction(params: {
  from: string
  to: string
  staffId?: string | null
}): Promise<ActionResult<Record<string, unknown>>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('report_voids', {
      p_from: params.from,
      p_to: params.to,
      p_staff_id: params.staffId || undefined,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Record<string, unknown> }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch voids report'
    return { success: false, error: msg }
  }
}

export async function fetchVatSummaryReportAction(params: {
  year?: number
}): Promise<ActionResult<Record<string, unknown>>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('report_vat_summary', {
      p_year: params.year ?? undefined,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Record<string, unknown> }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch VAT summary report'
    return { success: false, error: msg }
  }
}

export async function fetchReportFilterOptionsAction(): Promise<
  ActionResult<{
    universities: Array<{ id: string; name: string }>
    courses: Array<{ id: string; name: string; university_id: string }>
    staffList: Array<{ id: string; full_name: string }>
    vatEnabled: boolean
  }>
> {
  try {
    const { profile } = await requireUser()
    const supabase = await createClient()

    const [unisRes, coursesRes, staffRes, settingsRes] = await Promise.all([
      supabase.from('universities').select('id, name').order('name'),
      supabase.from('courses').select('id, name, university_id').order('name'),
      profile.role === 'super_admin' || profile.role === 'admin' || profile.role === 'owner'
        ? supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
        : Promise.resolve({ data: [{ id: profile.id, full_name: profile.full_name }], error: null }),
      supabase.from('company_settings').select('vat_enabled').limit(1).maybeSingle(),
    ])

    return {
      success: true,
      data: {
        universities: unisRes.data || [],
        courses: coursesRes.data || [],
        staffList: staffRes.data || [],
        vatEnabled: Boolean(settingsRes.data?.vat_enabled),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch filter options'
    return { success: false, error: msg }
  }
}
