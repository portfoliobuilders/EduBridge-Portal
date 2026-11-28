'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrAbove, requireSuperAdmin } from '@/lib/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { z } from 'zod'

const addStaffSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Invalid email address'),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['super_admin', 'admin', 'staff', 'owner']),
  job_title: z.string().trim().optional().nullable(),
  reports_to: z.string().uuid().optional().nullable(),
  admin_scope: z.enum(['team', 'company']).default('team'),
  is_support: z.boolean().default(false),
  is_sales_team: z.boolean().default(false),
  employee_id: z.string().trim().optional().nullable(),
  joining_date: z.string().optional().nullable(),
})

const updateStaffSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  name: z.string().trim().min(1, 'Full name is required'),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['super_admin', 'admin', 'staff', 'owner']),
  job_title: z.string().trim().optional().nullable(),
  reports_to: z.string().uuid().optional().nullable(),
  admin_scope: z.enum(['team', 'company']).default('team'),
  is_support: z.boolean().default(false),
  is_sales_team: z.boolean().default(false),
  is_active: z.boolean().default(true),
  employee_id: z.string().trim().optional().nullable(),
  joining_date: z.string().optional().nullable(),
})

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function inviteStaffAction(formData: FormData): Promise<ActionResult> {
  const { user: callerUser, profile: callerProfile } = await requireAdminOrAbove()

  const raw = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: formData.get('phone') ? String(formData.get('phone')) : null,
    role: (formData.get('role') as 'super_admin' | 'admin' | 'staff') ?? 'staff',
    job_title: formData.get('job_title') ? String(formData.get('job_title')) : null,
    reports_to: formData.get('reports_to') ? String(formData.get('reports_to')) : null,
    admin_scope: (formData.get('admin_scope') as 'team' | 'company') ?? 'team',
    is_support: formData.get('is_support') === 'true',
    is_sales_team: formData.get('is_sales_team') === 'true',
  }

  const parsed = addStaffSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { name, email, phone, role, job_title, reports_to, admin_scope, is_support, is_sales_team } = parsed.data

  // Permission check: Admins cannot create Super Admins or Admins
  if (callerProfile.role === 'admin') {
    if (role !== 'staff') {
      return { success: false, error: 'Admins can only invite staff members.' }
    }
    if (is_support) {
      return { success: false, error: 'Only Super Admins can create support accounts.' }
    }
  }

  // Normalize phone if provided
  let formattedPhone: string | null = null
  if (phone) {
    const parsedPhone = parsePhoneNumberFromString(phone, 'AE')
    if (parsedPhone && parsedPhone.isValid()) {
      formattedPhone = parsedPhone.format('E.164')
    } else {
      formattedPhone = phone
    }
  }

  // Check if SUPABASE_SECRET_KEY is configured
  if (!process.env.SUPABASE_SECRET_KEY) {
    return {
      success: false,
      error: 'SUPABASE_SECRET_KEY is not configured on the server. Staff cannot be invited without it.',
    }
  }

  let adminClient
  try {
    adminClient = createAdminClient()
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: errorMsg || 'Failed to initialize administrative Supabase client.',
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`

  // Invite user by email using supabase.auth.admin
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: name,
        phone: formattedPhone,
      },
    })

  if (inviteError) {
    const msg = inviteError.message.toLowerCase()
    if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
      return {
        success: false,
        error:
          'Supabase email sending rate limit reached. Please wait a few minutes before sending another invite, or configure custom SMTP in Supabase.',
      }
    }
    return { success: false, error: inviteError.message }
  }

  if (!inviteData?.user) {
    return { success: false, error: 'Failed to create user invitation' }
  }

  // Update profile with name, phone, role, job_title, reports_to, admin_scope, is_support
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: inviteData.user.id,
      full_name: name,
      phone: formattedPhone,
      role: role === 'owner' ? 'super_admin' : role,
      job_title: job_title || null,
      reports_to: reports_to || (callerProfile.role === 'admin' ? callerUser.id : null),
      admin_scope: role === 'admin' ? admin_scope : 'team',
      is_support: Boolean(is_support),
      is_sales_team: Boolean(is_sales_team),
      is_active: true,
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    return {
      success: false,
      error: `User invited, but profile update failed: ${profileError.message}`,
    }
  }

  revalidatePath('/admin/staff')
  return { success: true }
}

export async function updateStaffAction(formData: FormData): Promise<ActionResult> {
  const { profile: callerProfile } = await requireAdminOrAbove()
  const supabase = await createClient()

  const raw = {
    userId: String(formData.get('userId') ?? ''),
    name: String(formData.get('name') ?? ''),
    phone: formData.get('phone') ? String(formData.get('phone')) : null,
    role: (formData.get('role') as 'super_admin' | 'admin' | 'staff') ?? 'staff',
    job_title: formData.get('job_title') ? String(formData.get('job_title')) : null,
    reports_to: formData.get('reports_to') ? String(formData.get('reports_to')) : null,
    admin_scope: (formData.get('admin_scope') as 'team' | 'company') ?? 'team',
    is_support: formData.get('is_support') === 'true',
    is_sales_team: formData.get('is_sales_team') === 'true',
    is_active: formData.get('is_active') !== 'false',
    employee_id: formData.get('employee_id') ? String(formData.get('employee_id')) : null,
    joining_date: formData.get('joining_date') ? String(formData.get('joining_date')) : null,
  }

  const parsed = updateStaffSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const data = parsed.data

  // Admin restrictions
  if (callerProfile.role === 'admin') {
    if (data.role !== 'staff') {
      return { success: false, error: 'Admins cannot promote users to Admin or Super Admin.' }
    }
    if (data.is_support) {
      return { success: false, error: 'Admins cannot configure support status.' }
    }
    // Scope check: Admins can only edit staff within visible_user_ids(); never super_admin or other admins
    const { data: canManage } = await supabase.rpc('can_manage_user', { p_target: data.userId })
    if (!canManage) {
      return { success: false, error: 'Unauthorized: you do not have permission to manage this staff member.' }
    }
  }

  let formattedPhone: string | null = null
  if (data.phone) {
    const parsedPhone = parsePhoneNumberFromString(data.phone, 'AE')
    if (parsedPhone && parsedPhone.isValid()) {
      formattedPhone = parsedPhone.format('E.164')
    } else {
      formattedPhone = data.phone
    }
  }

  const excludeFromCelebrations = formData.has('exclude_from_celebrations')
    ? formData.get('exclude_from_celebrations') === 'true'
    : null

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: data.name,
      phone: formattedPhone,
      role: data.role === 'owner' ? 'super_admin' : data.role,
      job_title: data.job_title || null,
      reports_to: data.reports_to || null,
      admin_scope: data.role === 'admin' ? data.admin_scope : 'team',
      is_support: callerProfile.role === 'super_admin' ? data.is_support : undefined,
      is_sales_team: data.is_sales_team,
      is_active: data.is_active,
      employee_id: data.employee_id || null,
      joining_date: data.joining_date || null,
      celebrate_birthday: excludeFromCelebrations !== null ? !excludeFromCelebrations : undefined,
      celebrate_anniversary: excludeFromCelebrations !== null ? !excludeFromCelebrations : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.userId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Attendance settings update if provided
  const officeId = formData.get('office_id') ? String(formData.get('office_id')) : null
  const shiftStart = formData.get('shift_start') ? String(formData.get('shift_start')) : null
  const shiftEnd = formData.get('shift_end') ? String(formData.get('shift_end')) : null
  const graceMinutes = formData.get('grace_minutes') ? parseInt(String(formData.get('grace_minutes')), 10) : null
  const attendanceRequired = formData.get('attendance_required') !== null ? formData.get('attendance_required') === 'true' : null
  const allowFieldPunch = formData.get('allow_field_punch') !== null ? formData.get('allow_field_punch') === 'true' : null
  const weeklyOffRaw = formData.get('weekly_off') ? String(formData.get('weekly_off')) : null
  const weeklyOff = weeklyOffRaw
    ? weeklyOffRaw.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n))
    : undefined

  if (formData.has('office_id') || formData.has('shift_start') || formData.has('attendance_required') || formData.has('weekly_off')) {
    await supabase
      .from('staff_attendance_settings')
      .upsert({
        user_id: data.userId,
        office_id: officeId || null,
        shift_start: shiftStart || '09:00:00',
        shift_end: shiftEnd || '18:00:00',
        grace_minutes: graceMinutes ?? 15,
        attendance_required: attendanceRequired ?? true,
        allow_field_punch: allowFieldPunch ?? false,
        weekly_off: weeklyOff && weeklyOff.length > 0 ? weeklyOff : undefined,
        updated_at: new Date().toISOString(),
      })
  }

  // Sensitive details update if provided (saved to staff_sensitive_details)
  const personalEmail = formData.has('personal_email') ? (formData.get('personal_email') ? String(formData.get('personal_email')).trim() : null) : undefined
  const dob = formData.has('dob') ? (formData.get('dob') ? String(formData.get('dob')).trim() : null) : undefined
  const address = formData.has('address') ? (formData.get('address') ? String(formData.get('address')).trim() : null) : undefined
  const emergencyName = formData.has('emergency_contact_name') ? (formData.get('emergency_contact_name') ? String(formData.get('emergency_contact_name')).trim() : null) : undefined
  let emergencyPhone = formData.has('emergency_contact_phone') ? (formData.get('emergency_contact_phone') ? String(formData.get('emergency_contact_phone')).trim() : null) : undefined
  if (emergencyPhone) {
    const parsedEmerg = parsePhoneNumberFromString(emergencyPhone, 'AE')
    if (parsedEmerg && parsedEmerg.isValid()) {
      emergencyPhone = parsedEmerg.format('E.164')
    }
  }

  if (personalEmail !== undefined || dob !== undefined || address !== undefined || emergencyName !== undefined || emergencyPhone !== undefined) {
    const { data: rpcRes, error: sensErr } = await supabase.rpc('update_staff_sensitive_details', {
      p_user_id: data.userId,
      p_personal_email: personalEmail ?? undefined,
      p_dob: dob ?? undefined,
      p_address: address ?? undefined,
      p_emergency_contact_name: emergencyName ?? undefined,
      p_emergency_contact_phone: emergencyPhone ?? undefined,
    })

    if (sensErr) {
      return { success: false, error: sensErr.message }
    }
    const resObj = rpcRes as { success: boolean; error?: string } | null
    if (resObj && !resObj.success) {
      return { success: false, error: resObj.error || 'Failed to update sensitive details' }
    }
  }

  revalidatePath('/admin/staff')
  revalidatePath(`/admin/staff/${data.userId}`)
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function getStaffMemberForAdminAction(id: string) {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const [profileRes, sensitiveRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('staff_sensitive_details').select('*').eq('user_id', id).maybeSingle(),
  ])

  if (profileRes.error) {
    return { success: false, error: profileRes.error.message }
  }

  const staff = {
    ...profileRes.data,
    personal_email: sensitiveRes.data?.personal_email ?? null,
    dob: sensitiveRes.data?.dob ?? null,
    address: sensitiveRes.data?.address ?? null,
    emergency_contact_name: sensitiveRes.data?.emergency_contact_name ?? null,
    emergency_contact_phone: sensitiveRes.data?.emergency_contact_phone ?? null,
  }

  return { success: true, staff }
}

export async function toggleStaffRoleAction(
  userId: string,
  newRole: 'super_admin' | 'admin' | 'staff'
): Promise<ActionResult> {
  // Only Super Admins can directly switch roles
  await requireSuperAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) {
    // Surface verbatim error message from Postgres guard trigger
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/staff')
  return { success: true }
}

export async function toggleStaffActiveAction(
  userId: string,
  isActive: boolean
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId)

  if (error) {
    // Surface verbatim error message from Postgres guard trigger
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/staff')
  return { success: true }
}
