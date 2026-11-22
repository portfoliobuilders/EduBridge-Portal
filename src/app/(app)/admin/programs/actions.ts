'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOrAbove } from '@/lib/auth'
import { z } from 'zod'

const universitySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'University name is required'),
  country: z.string().trim().default('UAE'),
})

const courseSchema = z.object({
  id: z.string().uuid().optional(),
  university_id: z.string().uuid('Invalid university ID'),
  name: z.string().trim().min(1, 'Course name is required'),
  level: z.enum(
    ['Diploma', 'Bachelor', 'Master', 'PhD', 'Certificate', 'Other'],
    { message: 'Please select a valid degree level' }
  ),
  duration: z.string().trim().optional().nullable(),
  default_fee: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^\d+(\.\d{1,2})?$/.test(val),
      'Fee must be a valid number with up to 2 decimal places'
    ),
})

const specializationSchema = z.object({
  id: z.string().uuid().optional(),
  course_id: z.string().uuid('Invalid course ID'),
  name: z.string().trim().min(1, 'Specialization name is required'),
  default_fee: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^\d+(\.\d{1,2})?$/.test(val),
      'Fee must be a valid number with up to 2 decimal places'
    ),
})

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

// -----------------------------------------------------------------------------
// Universities
// -----------------------------------------------------------------------------

export async function saveUniversityAction(
  formData: FormData
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const raw = {
    id: formData.get('id') ? String(formData.get('id')) : undefined,
    name: String(formData.get('name') ?? ''),
    country: String(formData.get('country') ?? 'UAE'),
  }

  const parsed = universitySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { id, name, country } = parsed.data

  // Case-insensitive duplicate check
  let dupQuery = supabase
    .from('universities')
    .select('id, name')
    .ilike('name', name.trim())

  if (id) {
    dupQuery = dupQuery.neq('id', id)
  }

  const { data: existingDup } = await dupQuery.maybeSingle()
  if (existingDup) {
    return {
      success: false,
      error: `A university named "${existingDup.name}" already exists.`,
    }
  }

  if (id) {
    // Update
    const { error } = await supabase
      .from('universities')
      .update({ name, country })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A university with this name already exists.' }
      }
      return { success: false, error: error.message }
    }
  } else {
    // Insert
    const { error } = await supabase
      .from('universities')
      .insert({ name, country, is_active: true })

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A university with this name already exists.' }
      }
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/admin/programs')
  return { success: true }
}

export async function toggleUniversityActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const { error } = await supabase
    .from('universities')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/programs')
  return { success: true }
}

// -----------------------------------------------------------------------------
// Courses
// -----------------------------------------------------------------------------

export async function saveCourseAction(
  formData: FormData
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const raw = {
    id: formData.get('id') ? String(formData.get('id')) : undefined,
    university_id: String(formData.get('university_id') ?? ''),
    name: String(formData.get('name') ?? ''),
    level: String(formData.get('level') ?? 'Bachelor'),
    duration: formData.get('duration') ? String(formData.get('duration')) : null,
    default_fee: formData.get('default_fee') ? String(formData.get('default_fee')) : null,
  }

  const parsed = courseSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { id, university_id, name, level, duration, default_fee } = parsed.data
  const numericFee = default_fee ? Number(default_fee) : null

  // Case-insensitive duplicate check within university
  let dupQuery = supabase
    .from('courses')
    .select('id, name')
    .eq('university_id', university_id)
    .ilike('name', name.trim())

  if (id) {
    dupQuery = dupQuery.neq('id', id)
  }

  const { data: existingDup } = await dupQuery.maybeSingle()
  if (existingDup) {
    return {
      success: false,
      error: `A course named "${existingDup.name}" already exists for this university.`,
    }
  }

  if (id) {
    const { error } = await supabase
      .from('courses')
      .update({
        name,
        level,
        duration: duration || null,
        default_fee: numericFee,
      })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A course with this name already exists for this university.' }
      }
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('courses')
      .insert({
        university_id,
        name,
        level,
        duration: duration || null,
        default_fee: numericFee,
        is_active: true,
      })

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A course with this name already exists for this university.' }
      }
      return { success: false, error: error.message }
    }
  }

  revalidatePath(`/admin/programs/${university_id}`)
  revalidatePath('/admin/programs')
  return { success: true }
}

export async function toggleCourseActiveAction(
  courseId: string,
  universityId: string,
  isActive: boolean
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const { error } = await supabase
    .from('courses')
    .update({ is_active: isActive })
    .eq('id', courseId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath(`/admin/programs/${universityId}`)
  revalidatePath('/admin/programs')
  return { success: true }
}

// -----------------------------------------------------------------------------
// Specializations
// -----------------------------------------------------------------------------

export async function saveSpecializationAction(
  formData: FormData
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const raw = {
    id: formData.get('id') ? String(formData.get('id')) : undefined,
    course_id: String(formData.get('course_id') ?? ''),
    name: String(formData.get('name') ?? ''),
    default_fee: formData.get('default_fee') ? String(formData.get('default_fee')) : null,
  }

  const parsed = specializationSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { id, course_id, name, default_fee } = parsed.data
  const numericFee = default_fee ? Number(default_fee) : null

  // Case-insensitive duplicate check within course
  let dupQuery = supabase
    .from('specializations')
    .select('id, name')
    .eq('course_id', course_id)
    .ilike('name', name.trim())

  if (id) {
    dupQuery = dupQuery.neq('id', id)
  }

  const { data: existingDup } = await dupQuery.maybeSingle()
  if (existingDup) {
    return {
      success: false,
      error: `A specialization named "${existingDup.name}" already exists for this course.`,
    }
  }

  if (id) {
    const { error } = await supabase
      .from('specializations')
      .update({
        name,
        default_fee: numericFee,
      })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A specialization with this name already exists for this course.' }
      }
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('specializations')
      .insert({
        course_id,
        name,
        default_fee: numericFee,
        is_active: true,
      })

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A specialization with this name already exists for this course.' }
      }
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/admin/programs')
  return { success: true }
}

export async function toggleSpecializationActiveAction(
  specId: string,
  isActive: boolean
): Promise<ActionResult> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  const { error } = await supabase
    .from('specializations')
    .update({ is_active: isActive })
    .eq('id', specId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/programs')
  return { success: true }
}

// -----------------------------------------------------------------------------
// Bulk Import
// -----------------------------------------------------------------------------

export interface ImportPreviewRow {
  rowIndex: number
  university: string
  country: string
  course: string
  level: string
  duration: string
  course_default_fee: string
  specialization: string
  specialization_default_fee: string
  status: 'NEW' | 'EXISTS' | 'INVALID'
  reason?: string
}

export interface ImportPreviewResult {
  totalRows: number
  newCount: number
  existsCount: number
  invalidCount: number
  rows: ImportPreviewRow[]
}

export async function previewProgramsImportAction(
  rows: Array<Record<string, string>>
): Promise<ActionResult<ImportPreviewResult>> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  if (!rows || rows.length === 0) {
    return { success: false, error: 'No rows to preview' }
  }

  if (rows.length > 2000) {
    return { success: false, error: 'CSV exceeds limit of 2,000 rows' }
  }

  // Fetch all existing universities, courses, and specializations to check status
  const [{ data: existingUnis }, { data: existingCourses }, { data: existingSpecs }] =
    await Promise.all([
      supabase.from('universities').select('id, name'),
      supabase.from('courses').select('id, university_id, name'),
      supabase.from('specializations').select('id, course_id, name'),
    ])

  const uniMap = new Map<string, string>() // lower(name) -> id
  existingUnis?.forEach((u) => uniMap.set(u.name.toLowerCase().trim(), u.id))

  const courseMap = new Map<string, string>() // `${uniLower}::${courseLower}` -> id
  existingCourses?.forEach((c) => {
    // Find matching uni
    const uni = existingUnis?.find((u) => u.id === c.university_id)
    if (uni) {
      courseMap.set(`${uni.name.toLowerCase().trim()}::${c.name.toLowerCase().trim()}`, c.id)
    }
  })

  const specSet = new Set<string>() // `${uniLower}::${courseLower}::${specLower}`
  existingSpecs?.forEach((s) => {
    const course = existingCourses?.find((c) => c.id === s.course_id)
    if (course) {
      const uni = existingUnis?.find((u) => u.id === course.university_id)
      if (uni) {
        specSet.add(
          `${uni.name.toLowerCase().trim()}::${course.name.toLowerCase().trim()}::${s.name.toLowerCase().trim()}`
        )
      }
    }
  })

  const previewRows: ImportPreviewRow[] = []
  let newCount = 0
  let existsCount = 0
  let invalidCount = 0

  // Track items within the batch to detect duplicates in the CSV itself
  const batchUnis = new Set<string>()
  const batchCourses = new Set<string>()
  const batchSpecs = new Set<string>()

  const validLevels = ['Diploma', 'Bachelor', 'Master', 'PhD', 'Certificate', 'Other']

  rows.forEach((r, idx) => {
    const university = (r.university ?? '').trim()
    const country = (r.country ?? '').trim() || 'UAE'
    const course = (r.course ?? '').trim()
    const level = (r.level ?? '').trim() || 'Bachelor'
    const duration = (r.duration ?? '').trim()
    const course_default_fee = (r.course_default_fee ?? '').trim()
    const specialization = (r.specialization ?? '').trim()
    const specialization_default_fee = (r.specialization_default_fee ?? '').trim()

    let status: 'NEW' | 'EXISTS' | 'INVALID' = 'NEW'
    let reason: string | undefined

    if (!university) {
      status = 'INVALID'
      reason = 'University name is missing'
    } else if (!course) {
      status = 'INVALID'
      reason = 'Course name is missing'
    } else if (level && !validLevels.includes(level)) {
      status = 'INVALID'
      reason = `Invalid level "${level}". Must be Diploma, Bachelor, Master, PhD, Certificate, or Other`
    } else if (
      course_default_fee &&
      !/^\d+(\.\d{1,2})?$/.test(course_default_fee)
    ) {
      status = 'INVALID'
      reason = 'Course fee must be a non-negative number with up to 2 decimal places'
    } else if (
      specialization_default_fee &&
      !/^\d+(\.\d{1,2})?$/.test(specialization_default_fee)
    ) {
      status = 'INVALID'
      reason = 'Specialization fee must be a non-negative number with up to 2 decimal places'
    }

    if (status !== 'INVALID') {
      const uKey = university.toLowerCase()
      const cKey = `${uKey}::${course.toLowerCase()}`
      const sKey = specialization ? `${cKey}::${specialization.toLowerCase()}` : undefined

      if (specialization) {
        if (uniMap.has(uKey) && courseMap.has(cKey) && specSet.has(sKey!)) {
          status = 'EXISTS'
          reason = 'Specialization already exists'
        } else {
          status = 'NEW'
        }
      } else {
        if (uniMap.has(uKey) && courseMap.has(cKey)) {
          status = 'EXISTS'
          reason = 'Course already exists'
        } else {
          status = 'NEW'
        }
      }

      batchUnis.add(uKey)
      batchCourses.add(cKey)
      if (sKey) batchSpecs.add(sKey)
    }

    if (status === 'NEW') newCount++
    else if (status === 'EXISTS') existsCount++
    else invalidCount++

    previewRows.push({
      rowIndex: idx + 1,
      university,
      country,
      course,
      level,
      duration,
      course_default_fee,
      specialization,
      specialization_default_fee,
      status,
      reason,
    })
  })

  return {
    success: true,
    data: {
      totalRows: rows.length,
      newCount,
      existsCount,
      invalidCount,
      rows: previewRows,
    },
  }
}

export async function executeProgramsImportAction(
  rows: Array<Record<string, unknown>>
): Promise<
  ActionResult<{
    created_universities: number
    created_courses: number
    created_specializations: number
    skipped: number
  }>
> {
  await requireAdminOrAbove()
  const supabase = await createClient()

  if (!rows || rows.length === 0) {
    return { success: false, error: 'No rows to import' }
  }

  if (rows.length > 2000) {
    return { success: false, error: 'Import exceeds maximum limit of 2,000 rows' }
  }

  // Call the atomic import_programs Postgres function
  const { data, error } = await supabase.rpc('import_programs', {
    p_data: rows as unknown as import('@/types/database').Json,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/programs')
  return {
    success: true,
    data: data as {
      created_universities: number
      created_courses: number
      created_specializations: number
      skipped: number
    },
  }
}
