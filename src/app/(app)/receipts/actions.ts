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

const recordPaymentSchema = z
  .object({
    enrollmentId: z.string().uuid('Please select a valid enrollment'),
    amount: z.coerce.number().positive('Amount must be greater than zero'),
    mode: z.enum(['card', 'cash', 'link', 'bank_transfer']),
    purpose: z.enum(['admission', 'repayment', 'other']),
    purposeNote: z.string().trim().optional().nullable(),
    referenceNo: z.string().trim().optional().nullable(),
    paidAt: z.string().min(1, 'Payment date and time is required'),
    payeeName: z.string().trim().optional().nullable(),
    comments: z.string().trim().optional().nullable(),
    idempotencyKey: z.string().uuid('Valid idempotency key is required'),
  })
  .refine(
    (data) => {
      if (data.mode !== 'cash') {
        return !!data.referenceNo && data.referenceNo.trim().length >= 2
      }
      return true
    },
    {
      message: 'Reference number is required for Card, Link, and Bank Transfer payments',
      path: ['referenceNo'],
    }
  )
  .refine(
    (data) => {
      if (data.purpose === 'other') {
        return !!data.purposeNote && data.purposeNote.trim().length >= 2
      }
      return true
    },
    {
      message: 'Purpose note is required when purpose is Other',
      path: ['purposeNote'],
    }
  )
  .refine(
    (data) => {
      const parsedDate = new Date(data.paidAt)
      if (isNaN(parsedDate.getTime())) return false

      const now = new Date()
      const maxFuture = new Date(now.getTime() + 5 * 60 * 1000) // 5 mins
      const maxPast = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days

      return parsedDate <= maxFuture && parsedDate >= maxPast
    },
    {
      message: 'Payment date cannot be in the future and cannot be older than 30 days',
      path: ['paidAt'],
    }
  )

export async function recordPaymentAction(
  values: z.infer<typeof recordPaymentSchema>
): Promise<ActionResult<{ paymentId: string; receiptNo: string }>> {
  try {
    await requireUser()

    const parsed = recordPaymentSchema.safeParse(values)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid form submission',
      }
    }

    const {
      enrollmentId,
      amount,
      mode,
      purpose,
      purposeNote,
      referenceNo,
      paidAt,
      payeeName,
      comments,
      idempotencyKey,
    } = parsed.data

    const supabase = await createClient()

    const { data: payment, error } = await supabase.rpc('record_payment', {
      p_enrollment_id: enrollmentId,
      p_amount: amount,
      p_mode: mode,
      p_purpose: purpose,
      p_purpose_note: purposeNote ? purposeNote.trim() : '',
      p_reference_no: referenceNo ? referenceNo.trim() : '',
      p_paid_at: new Date(paidAt).toISOString(),
      p_payee_name: payeeName ? payeeName.trim() : '',
      p_comments: comments ? comments.trim() : '',
      p_idempotency_key: idempotencyKey,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (!payment) {
      return { success: false, error: 'Failed to record payment' }
    }

    revalidatePath('/receipts')
    revalidatePath(`/receipts/${payment.id}`)
    revalidatePath(`/students`)
    revalidatePath(`/students/${payment.student_id}`)

    return {
      success: true,
      data: {
        paymentId: payment.id,
        receiptNo: payment.receipt_no,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

const voidPaymentSchema = z.object({
  paymentId: z.string().uuid('Invalid payment ID'),
  reason: z.string().trim().min(5, 'Void reason must be at least 5 characters'),
})

export async function voidPaymentAction(
  values: z.infer<typeof voidPaymentSchema>
): Promise<ActionResult<{ paymentId: string }>> {
  try {
    await requireOwner()

    const parsed = voidPaymentSchema.safeParse(values)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid parameters',
      }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('void_payment', {
      p_payment_id: parsed.data.paymentId,
      p_reason: parsed.data.reason,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/receipts/${parsed.data.paymentId}`)
    revalidatePath('/receipts')
    if (data?.student_id) {
      revalidatePath(`/students/${data.student_id}`)
    }

    return { success: true, data: { paymentId: parsed.data.paymentId } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function searchEnrollmentsForPayment(query: string) {
  await requireUser()
  const supabase = await createClient()

  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  // 1. Search students first
  const { data: matchedStudents } = await supabase
    .from('students')
    .select('id')
    .or(`full_name.ilike.%${trimmed}%,student_code.ilike.%${trimmed}%,mobile.ilike.%${trimmed}%`)
    .eq('is_active', true)
    .limit(25)

  if (!matchedStudents || matchedStudents.length === 0) return []
  const studentIds = matchedStudents.map((s) => s.id)

  // 2. Query active enrollments for matching students
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id,
      student_id,
      total_fee,
      discount,
      vat_type,
      vat_rate,
      status,
      intake,
      student:students!inner(
        id,
        full_name,
        student_code,
        mobile
      ),
      university:universities!inner(
        name
      ),
      course:courses!inner(
        name
      ),
      specialization:specializations(
        name
      )
    `)
    .eq('status', 'active')
    .in('student_id', studentIds)
    .limit(25)

  if (error || !data || data.length === 0) return []

  // 3. Query ledger for these enrollments
  const enrollmentIds = data.map((e) => e.id)
  const { data: ledgers } = await supabase
    .from('enrollment_ledger')
    .select('enrollment_id, total_payable, total_paid, balance')
    .in('enrollment_id', enrollmentIds)

  const ledgerMap = new Map((ledgers ?? []).map((l) => [l.enrollment_id, l]))

  return data.map((item) => {
    const ledger = ledgerMap.get(item.id)
    return {
      enrollmentId: item.id,
      studentId: item.student_id,
      studentName: item.student.full_name,
      studentCode: item.student.student_code,
      studentMobile: item.student.mobile,
      universityName: item.university.name,
      courseName: item.course.name,
      specializationName: item.specialization?.name ?? null,
      intake: item.intake,
      vatType: item.vat_type,
      vatRate: item.vat_rate,
      totalPayable: Number(ledger?.total_payable ?? item.total_fee - item.discount),
      totalPaid: Number(ledger?.total_paid ?? 0),
      balance: Number(ledger?.balance ?? (item.total_fee - item.discount)),
    }
  })
}
