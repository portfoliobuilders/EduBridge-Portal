'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { z } from 'zod'

const addStaffSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Invalid email address'),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['staff', 'owner']),
})

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function inviteStaffAction(formData: FormData): Promise<ActionResult> {
  await requireOwner()

  const raw = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: formData.get('phone') ? String(formData.get('phone')) : null,
    role: (formData.get('role') as 'staff' | 'owner') ?? 'staff',
  }

  const parsed = addStaffSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { name, email, phone, role } = parsed.data

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

  // Update profile with name, phone, and role
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: inviteData.user.id,
      full_name: name,
      phone: formattedPhone,
      role,
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

export async function toggleStaffRoleAction(
  userId: string,
  newRole: 'staff' | 'owner'
): Promise<ActionResult> {
  await requireOwner()
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
  await requireOwner()
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
