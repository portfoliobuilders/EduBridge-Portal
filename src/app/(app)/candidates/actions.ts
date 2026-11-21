'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireOwner } from '@/lib/auth'
import { z } from 'zod'

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

export const addressSchema = z.object({
  contactName: z.string().trim().optional().nullable(),
  contactPhone: z.string().trim().optional().nullable(),
  line1: z.string().trim().min(1, 'Address line 1 is required'),
  line2: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  country: z.string().trim().default('United Arab Emirates'),
})

const createStudentSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required (min 2 characters)'),
  mobile: z.string().trim().min(7, 'Mobile number is required'),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Invalid email address').optional().nullable().or(z.literal('')),
  notes: z.string().trim().optional().nullable(),
  universityId: z.string().uuid('Please select a valid university'),
  courseId: z.string().uuid('Please select a valid course'),
  specializationId: z.string().uuid('Invalid specialization').optional().nullable().or(z.literal('')),
  totalFee: z.coerce.number().min(0, 'Total fee must be positive'),
  discount: z.coerce.number().min(0, 'Discount must be 0 or positive').default(0),
  intake: z.string().trim().optional().nullable(),
  admissionStaffId: z.string().uuid().optional().nullable().or(z.literal('')),
  // Guardian fields
  guardianName: z.string().trim().optional().nullable(),
  guardianRelation: z.enum(['father', 'mother', 'guardian', 'spouse', 'other']).optional().nullable().or(z.literal('')),
  guardianPhone: z.string().trim().optional().nullable(),
  guardianWhatsapp: z.string().trim().optional().nullable(),
  guardianEmail: z.string().trim().email('Invalid guardian email').optional().nullable().or(z.literal('')),
  // Opening balance fields
  openingPaid: z.coerce.number().min(0, 'Opening paid cannot be negative').default(0),
  openingPaidNote: z.string().trim().optional().nullable(),
  // Address fields
  billingAddress: addressSchema.optional().nullable(),
  shippingAddress: addressSchema.optional().nullable(),
}).refine((data) => data.discount <= data.totalFee, {
  message: 'Discount cannot exceed total fee',
  path: ['discount'],
}).refine((data) => (data.totalFee - data.discount) >= data.openingPaid, {
  message: 'Opening paid cannot exceed net fee',
  path: ['openingPaid'],
})

const updateContactSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  fullName: z.string().trim().min(2, 'Full name is required'),
  mobile: z.string().trim().min(7, 'Mobile number is required'),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Invalid email address').optional().nullable().or(z.literal('')),
  notes: z.string().trim().optional().nullable(),
})

const updateGuardianSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  guardianName: z.string().trim().optional().nullable(),
  guardianRelation: z.enum(['father', 'mother', 'guardian', 'spouse', 'other']).optional().nullable().or(z.literal('')),
  guardianPhone: z.string().trim().optional().nullable(),
  guardianWhatsapp: z.string().trim().optional().nullable(),
  guardianEmail: z.string().trim().email('Invalid guardian email').optional().nullable().or(z.literal('')),
})

const saveAddressSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  type: z.enum(['billing', 'shipping']),
  addressId: z.string().uuid().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  contactPhone: z.string().trim().optional().nullable(),
  line1: z.string().trim().min(1, 'Address line 1 is required'),
  line2: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  country: z.string().trim().default('United Arab Emirates'),
})

const updateOpeningPaidSchema = z.object({
  enrollmentId: z.string().uuid('Invalid enrollment ID'),
  openingPaid: z.coerce.number().min(0, 'Opening paid must be 0 or greater'),
  openingPaidNote: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
})

const updateFeeSchema = z.object({
  enrollmentId: z.string().uuid('Invalid enrollment ID'),
  totalFee: z.coerce.number().min(0, 'Total fee must be 0 or greater'),
  discount: z.coerce.number().min(0, 'Discount must be 0 or greater').default(0),
  reason: z.string().trim().optional().nullable(),
}).refine((data) => data.discount <= data.totalFee, {
  message: 'Discount cannot exceed total fee',
  path: ['discount'],
})

const addEnrollmentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  universityId: z.string().uuid('Please select a university'),
  courseId: z.string().uuid('Please select a course'),
  specializationId: z.string().uuid().optional().nullable().or(z.literal('')),
  totalFee: z.coerce.number().min(0, 'Total fee must be positive'),
  discount: z.coerce.number().min(0, 'Discount must be positive').default(0),
  intake: z.string().trim().optional().nullable(),
  admissionStaffId: z.string().uuid().optional().nullable().or(z.literal('')),
}).refine((data) => data.discount <= data.totalFee, {
  message: 'Discount cannot exceed total fee',
  path: ['discount'],
})

// -----------------------------------------------------------------------------
// Duplicate Guard Action
// -----------------------------------------------------------------------------

export async function checkDuplicateMobileAction(
  mobile: string
): Promise<{ exists: boolean; student?: { id: string; fullName: string; studentCode: string } }> {
  await requireUser()
  const cleaned = mobile.trim()
  if (!cleaned || cleaned.length < 5) {
    return { exists: false }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, student_code')
    .eq('mobile', cleaned)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return { exists: false }
  }

  return {
    exists: true,
    student: {
      id: data.id,
      fullName: data.full_name,
      studentCode: data.student_code,
    },
  }
}

// -----------------------------------------------------------------------------
// Create Student + Enrollment Action (Atomic RPC)
// -----------------------------------------------------------------------------

export async function createStudentAction(
  rawInput: unknown
): Promise<ActionResult<{ studentId: string; studentCode: string; enrollmentId: string }>> {
  const { user, profile } = await requireUser()

  const parsed = createStudentSchema.safeParse(rawInput)
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input data'
    return { success: false, error: firstError }
  }

  const data = parsed.data
  const supabase = await createClient()

  // Staff can only assign themselves as admission staff
  let admissionStaffId = data.admissionStaffId || user.id
  if (profile.role !== 'owner') {
    admissionStaffId = user.id
  }

  const billingPayload = data.billingAddress && data.billingAddress.line1 ? {
    contact_name: data.billingAddress.contactName || null,
    contact_phone: data.billingAddress.contactPhone || null,
    line1: data.billingAddress.line1,
    line2: data.billingAddress.line2 || null,
    city: data.billingAddress.city || 'Dubai',
    state: data.billingAddress.state || null,
    postal_code: data.billingAddress.postalCode || null,
    country: data.billingAddress.country || 'United Arab Emirates',
  } : undefined

  const shippingPayload = data.shippingAddress && data.shippingAddress.line1 ? {
    contact_name: data.shippingAddress.contactName || null,
    contact_phone: data.shippingAddress.contactPhone || null,
    line1: data.shippingAddress.line1,
    line2: data.shippingAddress.line2 || null,
    city: data.shippingAddress.city || 'Dubai',
    state: data.shippingAddress.state || null,
    postal_code: data.shippingAddress.postalCode || null,
    country: data.shippingAddress.country || 'United Arab Emirates',
  } : undefined

  const { data: rpcResult, error } = await supabase.rpc('create_student_with_enrollment', {
    p_full_name: data.fullName,
    p_mobile: data.mobile,
    p_whatsapp: data.whatsapp || data.mobile,
    p_email: data.email || undefined,
    p_notes: data.notes || undefined,
    p_university_id: data.universityId,
    p_course_id: data.courseId,
    p_specialization_id: data.specializationId || undefined,
    p_total_fee: data.totalFee,
    p_discount: data.discount,
    p_intake: data.intake || undefined,
    p_admission_staff_id: admissionStaffId,
    p_guardian_name: data.guardianName || undefined,
    p_guardian_relation: (data.guardianRelation as 'father' | 'mother' | 'guardian' | 'spouse' | 'other') || undefined,
    p_guardian_phone: data.guardianPhone || undefined,
    p_guardian_whatsapp: data.guardianWhatsapp || undefined,
    p_guardian_email: data.guardianEmail || undefined,
    p_opening_paid: data.openingPaid || 0,
    p_opening_paid_note: data.openingPaidNote || undefined,
    p_billing_address: billingPayload,
    p_shipping_address: shippingPayload,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const res = rpcResult as { student_id: string; student_code: string; enrollment_id: string }

  revalidatePath('/candidates')
  return {
    success: true,
    data: {
      studentId: res.student_id,
      studentCode: res.student_code,
      enrollmentId: res.enrollment_id,
    },
  }
}

// -----------------------------------------------------------------------------
// Update Student Contact Details Action
// -----------------------------------------------------------------------------

export async function updateStudentContactAction(
  rawInput: unknown
): Promise<ActionResult> {
  const { user, profile } = await requireUser()

  const parsed = updateContactSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation error' }
  }

  const data = parsed.data
  const supabase = await createClient()

  // Fetch student to verify creator if not owner
  if (profile.role !== 'owner') {
    const { data: existing, error: fetchErr } = await supabase
      .from('students')
      .select('created_by')
      .eq('id', data.studentId)
      .single()

    if (fetchErr || !existing) {
      return { success: false, error: 'Candidate record not found' }
    }

    if (existing.created_by !== user.id) {
      return { success: false, error: 'Staff may only edit contact details for candidates they created' }
    }
  }

  const { error } = await supabase
    .from('students')
    .update({
      full_name: data.fullName,
      mobile: data.mobile,
      whatsapp: data.whatsapp || data.mobile,
      email: data.email || null,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.studentId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/candidates')
  revalidatePath(`/candidates/${data.studentId}`)
  return { success: true }
}

// -----------------------------------------------------------------------------
// Update Student Guardian Details Action
// -----------------------------------------------------------------------------

export async function updateStudentGuardianAction(
  rawInput: unknown
): Promise<ActionResult> {
  const { user, profile } = await requireUser()

  const parsed = updateGuardianSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation error' }
  }

  const data = parsed.data
  const supabase = await createClient()

  if (profile.role !== 'owner') {
    const { data: existing, error: fetchErr } = await supabase
      .from('students')
      .select('created_by')
      .eq('id', data.studentId)
      .single()

    if (fetchErr || !existing) {
      return { success: false, error: 'Candidate record not found' }
    }

    if (existing.created_by !== user.id) {
      return { success: false, error: 'Staff may only edit guardian details for candidates they created' }
    }
  }

  const { error } = await supabase
    .from('students')
    .update({
      guardian_name: data.guardianName || null,
      guardian_relation: (data.guardianRelation as 'father' | 'mother' | 'guardian' | 'spouse' | 'other') || null,
      guardian_phone: data.guardianPhone || null,
      guardian_whatsapp: data.guardianWhatsapp || null,
      guardian_email: data.guardianEmail || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.studentId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/candidates')
  revalidatePath(`/candidates/${data.studentId}`)
  return { success: true }
}

// -----------------------------------------------------------------------------
// Save Student Address Action (Billing / Shipping)
// -----------------------------------------------------------------------------

export async function saveStudentAddressAction(
  rawInput: unknown
): Promise<ActionResult<{ addressId: string }>> {
  const { user, profile } = await requireUser()

  const parsed = saveAddressSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation error' }
  }

  const data = parsed.data
  const supabase = await createClient()

  // Verify access permissions: owner or creator of student
  if (profile.role !== 'owner') {
    const { data: student, error: sErr } = await supabase
      .from('students')
      .select('created_by')
      .eq('id', data.studentId)
      .single()

    if (sErr || !student) {
      return { success: false, error: 'Candidate record not found' }
    }

    if (student.created_by !== user.id) {
      return { success: false, error: 'Staff may only edit addresses for candidates they created' }
    }
  }

  // Check if an address of this type already exists for this student
  let targetAddressId = data.addressId

  if (!targetAddressId) {
    const { data: existing } = await supabase
      .from('student_addresses')
      .select('id')
      .eq('student_id', data.studentId)
      .eq('type', data.type)
      .eq('is_default', true)
      .maybeSingle()

    if (existing) {
      targetAddressId = existing.id
    }
  }

  if (targetAddressId) {
    // Update existing
    const { error: updateErr } = await supabase
      .from('student_addresses')
      .update({
        contact_name: data.contactName || null,
        contact_phone: data.contactPhone || null,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state || null,
        postal_code: data.postalCode || null,
        country: data.country || 'United Arab Emirates',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetAddressId)

    if (updateErr) {
      return { success: false, error: updateErr.message }
    }

    revalidatePath(`/candidates/${data.studentId}`)
    return { success: true, data: { addressId: targetAddressId } }
  } else {
    // Insert new
    const { data: inserted, error: insertErr } = await supabase
      .from('student_addresses')
      .insert({
        student_id: data.studentId,
        type: data.type,
        contact_name: data.contactName || null,
        contact_phone: data.contactPhone || null,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state || null,
        postal_code: data.postalCode || null,
        country: data.country || 'United Arab Emirates',
        is_default: true,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return { success: false, error: insertErr?.message || 'Failed to save address' }
    }

    revalidatePath(`/candidates/${data.studentId}`)
    return { success: true, data: { addressId: inserted.id } }
  }
}

// -----------------------------------------------------------------------------
// Update Opening Paid Action (Owner Only)
// -----------------------------------------------------------------------------

export async function updateEnrollmentOpeningPaidAction(
  rawInput: unknown
): Promise<ActionResult> {
  await requireOwner()

  const parsed = updateOpeningPaidSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation error' }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_enrollment_opening_paid', {
    p_enrollment_id: data.enrollmentId,
    p_opening_paid: data.openingPaid,
    p_opening_paid_note: data.openingPaidNote || undefined,
    p_reason: data.reason || undefined,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/candidates')
  return { success: true }
}

// -----------------------------------------------------------------------------
// Update Enrollment Fee Action (Owner Only)
// -----------------------------------------------------------------------------

export async function updateEnrollmentFeeAction(
  rawInput: unknown
): Promise<ActionResult> {
  await requireOwner()

  const parsed = updateFeeSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation error' }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_enrollment_fee', {
    p_enrollment_id: data.enrollmentId,
    p_total_fee: data.totalFee,
    p_discount: data.discount,
    p_reason: data.reason || undefined,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/candidates')
  return { success: true }
}

// -----------------------------------------------------------------------------
// Add Enrollment to Existing Student Action
// -----------------------------------------------------------------------------

export async function addStudentEnrollmentAction(
  rawInput: unknown
): Promise<ActionResult<{ enrollmentId: string }>> {
  const { user, profile } = await requireUser()

  const parsed = addEnrollmentSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Validation error' }
  }

  const data = parsed.data
  const supabase = await createClient()

  let admissionStaffId = data.admissionStaffId || user.id
  if (profile.role !== 'owner') {
    admissionStaffId = user.id
  }

  const { data: rpcResult, error } = await supabase.rpc('add_student_enrollment', {
    p_student_id: data.studentId,
    p_university_id: data.universityId,
    p_course_id: data.courseId,
    p_specialization_id: data.specializationId || undefined,
    p_total_fee: data.totalFee,
    p_discount: data.discount,
    p_intake: data.intake || undefined,
    p_admission_staff_id: admissionStaffId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const res = rpcResult as { enrollment_id: string }

  revalidatePath('/candidates')
  revalidatePath(`/candidates/${data.studentId}`)
  return {
    success: true,
    data: { enrollmentId: res.enrollment_id },
  }
}
