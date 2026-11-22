'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { z } from 'zod'

export interface StaffProfileFull {
  id: string
  full_name: string
  display_name?: string | null
  phone?: string | null
  role: string
  is_active: boolean
  job_title?: string | null
  reports_to?: string | null
  admin_scope: string
  employee_id?: string | null
  joining_date?: string | null
  avatar_url?: string | null
  celebrate_birthday: boolean
  celebrate_anniversary: boolean
  email_digest_enabled: boolean
  work_email?: string | null
  personal_email?: string | null
  dob?: string | null
  address?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  created_at: string
  updated_at: string
}

const updateProfileSchema = z.object({
  display_name: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  personal_email: z.string().trim().email('Invalid personal email').optional().nullable().or(z.literal('')),
  dob: z.string().optional().nullable().or(z.literal('')),
  address: z.string().trim().max(300).optional().nullable(),
  emergency_contact_name: z.string().trim().max(100).optional().nullable(),
  emergency_contact_phone: z.string().trim().optional().nullable(),
  celebrate_birthday: z.boolean(),
  celebrate_anniversary: z.boolean(),
  email_digest_enabled: z.boolean(),
})

export async function getMyProfileAction(): Promise<{
  success: boolean
  profile?: StaffProfileFull
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const supabase = await createClient()

    // Query staff_directory_view which joins profiles + staff_sensitive_details (allowed for self by RLS)
    const { data, error } = await supabase
      .from('staff_directory_view')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, profile: data as StaffProfileFull }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load profile'
    return { success: false, error: message }
  }
}

export async function updateMyProfileAction(formData: FormData): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await requireUser()
    const raw = {
      display_name: formData.get('display_name') ? String(formData.get('display_name')) : null,
      phone: formData.get('phone') ? String(formData.get('phone')) : null,
      personal_email: formData.get('personal_email') ? String(formData.get('personal_email')) : null,
      dob: formData.get('dob') ? String(formData.get('dob')) : null,
      address: formData.get('address') ? String(formData.get('address')) : null,
      emergency_contact_name: formData.get('emergency_contact_name') ? String(formData.get('emergency_contact_name')) : null,
      emergency_contact_phone: formData.get('emergency_contact_phone') ? String(formData.get('emergency_contact_phone')) : null,
      celebrate_birthday: formData.get('celebrate_birthday') === 'true',
      celebrate_anniversary: formData.get('celebrate_anniversary') === 'true',
      email_digest_enabled: formData.get('email_digest_enabled') === 'true',
    }

    const parsed = updateProfileSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }

    let formattedPhone = parsed.data.phone
    if (formattedPhone) {
      const pn = parsePhoneNumberFromString(formattedPhone, 'AE')
      if (pn && pn.isValid()) {
        formattedPhone = pn.format('E.164')
      }
    }

    let formattedEmergencyPhone = parsed.data.emergency_contact_phone
    if (formattedEmergencyPhone) {
      const pn = parsePhoneNumberFromString(formattedEmergencyPhone, 'AE')
      if (pn && pn.isValid()) {
        formattedEmergencyPhone = pn.format('E.164')
      }
    }

    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('update_my_profile', {
      p_display_name: parsed.data.display_name || null,
      p_phone: formattedPhone || null,
      p_personal_email: parsed.data.personal_email || null,
      p_dob: parsed.data.dob || null,
      p_address: parsed.data.address || null,
      p_emergency_contact_name: parsed.data.emergency_contact_name || null,
      p_emergency_contact_phone: formattedEmergencyPhone || null,
      p_celebrate_birthday: parsed.data.celebrate_birthday,
      p_celebrate_anniversary: parsed.data.celebrate_anniversary,
      p_email_digest_enabled: parsed.data.email_digest_enabled,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/profile')
    revalidatePath('/')
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile'
    return { success: false, error: message }
  }
}

export async function uploadAvatarAction(formData: FormData): Promise<{
  success: boolean
  avatar_url?: string
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    // Limit <= 1 MB (1,048,576 bytes)
    if (file.size > 1048576) {
      return { success: false, error: 'Photo must be 1 MB or smaller' }
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return { success: false, error: 'Only JPEG, PNG, or WebP images are allowed' }
    }

    const adminSupabase = createAdminClient()
    const ext = file.type.split('/')[1] || 'jpg'
    const fileName = `${user.id}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // Upload to private bucket staff-avatars
    const { error: uploadError } = await adminSupabase.storage
      .from('staff-avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    // Create 10-year signed URL for the avatar
    const { data: signedData, error: signedError } = await adminSupabase.storage
      .from('staff-avatars')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10)

    if (signedError || !signedData?.signedUrl) {
      return { success: false, error: signedError?.message || 'Failed to create avatar URL' }
    }

    const avatarUrl = signedData.signedUrl

    // Update profiles table
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase.rpc as any)('update_my_profile', {
      p_avatar_url: avatarUrl,
    })

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    revalidatePath('/profile')
    revalidatePath('/')
    return { success: true, avatar_url: avatarUrl }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to upload photo'
    return { success: false, error: message }
  }
}
