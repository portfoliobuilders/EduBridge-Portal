import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface TestCandidateResult {
  studentId: string
  studentCode: string
  enrollmentId: string
  fullName: string
  mobile: string
}

/**
 * Creates a test candidate and enrollment through the official create_student_with_enrollment RPC.
 */
export async function createTestCandidateWithEnrollment(
  client: SupabaseClient,
  options?: {
    fullName?: string
    mobile?: string
    staffUserId?: string
    email?: string
    password?: string
  }
): Promise<TestCandidateResult> {
  let callerClient = client
  if (options?.email && options?.password) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
    if (url && key) {
      const authedClient = createClient(url, key)
      const { error: signErr } = await authedClient.auth.signInWithPassword({
        email: options.email,
        password: options.password,
      })
      if (!signErr) {
        callerClient = authedClient
      }
    }
  }

  const runId = Date.now()
  const fullName = options?.fullName || `Test Candidate ${runId}`
  // Generate random 7 digits for phone number
  const randomDigits = Math.floor(1000000 + Math.random() * 9000000).toString()
  const mobile = options?.mobile || `+97150${randomDigits}`

  // 1. Get an active university and course
  const { data: uni, error: uErr } = await callerClient
    .from('universities')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (uErr || !uni) {
    throw new Error(`Failed to find active university: ${uErr?.message}`)
  }

  const { data: course, error: cErr } = await callerClient
    .from('courses')
    .select('id, default_fee')
    .eq('university_id', uni.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (cErr || !course) {
    throw new Error(`Failed to find active course: ${cErr?.message}`)
  }

  // 2. Call create_student_with_enrollment RPC
  const { data: rpcRes, error: rpcErr } = await callerClient.rpc('create_student_with_enrollment', {
    p_full_name: fullName,
    p_mobile: mobile,
    p_whatsapp: mobile,
    p_university_id: uni.id,
    p_course_id: course.id,
    p_total_fee: course.default_fee || 5000,
    p_discount: 0,
    p_admission_staff_id: options?.staffUserId || undefined,
  })

  if (rpcErr || !rpcRes) {
    throw new Error(`Failed to create test candidate via RPC: ${rpcErr?.message}`)
  }

  const result = rpcRes as { student_id: string; student_code: string; enrollment_id: string }

  return {
    studentId: result.student_id,
    studentCode: result.student_code,
    enrollmentId: result.enrollment_id,
    fullName,
    mobile,
  }
}

/**
 * Cleanly deletes a test candidate and all linked records using the delete_test_candidate RPC.
 */
export async function deleteTestCandidate(client: SupabaseClient, studentId: string): Promise<void> {
  if (!studentId) return
  const { error } = await client.rpc('delete_test_candidate', { p_student_id: studentId })
  if (error) {
    console.error(`Failed to delete test candidate ${studentId}:`, error.message)
  }
}
