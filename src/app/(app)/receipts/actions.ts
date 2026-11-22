'use server'

import { revalidatePath } from 'next/cache'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireOwner } from '@/lib/auth'
import { ReceiptDocument } from '@/lib/pdf/receipt-document'
import { sendReceiptEmail, type EmailSendResult } from '@/lib/email/send-email'
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
    paidAt: z.string().min(1, 'Payment date and time is required'),
    payeeName: z.string().trim().optional().nullable(),
    comments: z.string().trim().optional().nullable(),
    idempotencyKey: z.string().uuid('Valid idempotency key is required'),
  })
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
      p_reference_no: '',
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
    revalidatePath(`/candidates`)
    revalidatePath(`/candidates/${payment.student_id}`)

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
      revalidatePath(`/candidates/${data.student_id}`)
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

  const cleanDigits = trimmed.replace(/\D/g, '')
  const noZero = cleanDigits.replace(/^0+/, '')
  const clauses = [
    `full_name.ilike.%${trimmed}%`,
    `student_code.ilike.%${trimmed}%`,
    `mobile.ilike.%${trimmed}%`,
  ]
  if (cleanDigits.length >= 3) {
    clauses.push(`mobile.ilike.%${cleanDigits}%`)
  }
  if (noZero.length >= 3 && noZero !== cleanDigits) {
    clauses.push(`mobile.ilike.%${noZero}%`)
  }

  // 1. Search students first
  const { data: matchedStudents } = await supabase
    .from('students')
    .select('id')
    .or(clauses.join(','))
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
        mobile,
        guardian_name
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

  // 3. Query ledger & billing addresses for these enrollments
  const enrollmentIds = data.map((e) => e.id)
  const [ledgerRes, addrRes] = await Promise.all([
    supabase
      .from('enrollment_ledger')
      .select('enrollment_id, total_payable, total_paid, balance')
      .in('enrollment_id', enrollmentIds),
    supabase
      .from('student_addresses')
      .select('student_id, contact_name')
      .in('student_id', studentIds)
      .eq('type', 'billing')
      .eq('is_default', true),
  ])

  const ledgerMap = new Map((ledgerRes.data ?? []).map((l) => [l.enrollment_id, l]))
  const billingMap = new Map((addrRes.data ?? []).map((a) => [a.student_id, a.contact_name]))

  return data.map((item) => {
    const ledger = ledgerMap.get(item.id)
    const billingContact = billingMap.get(item.student.id)
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
      guardianName: item.student.guardian_name ?? null,
      billingContactName: billingContact ?? null,
    }
  })
}

// -----------------------------------------------------------------------------
// Share Actions (Link management, share logging, email)
// -----------------------------------------------------------------------------

const logShareSchema = z.object({
  paymentId: z.string().uuid().optional().nullable(),
  enrollmentId: z.string().uuid().optional().nullable(),
  channel: z.enum([
    'whatsapp',
    'email',
    'web_share',
    'sms',
    'download',
    'print',
    'link_copy',
  ]),
  recipient: z.string().optional().nullable(),
  meta: z.record(z.string(), z.any()).optional().nullable(),
})

export async function logShareAction(
  values: z.infer<typeof logShareSchema>
): Promise<ActionResult> {
  try {
    const { user } = await requireUser()
    const parsed = logShareSchema.safeParse(values)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('share_logs').insert({
      payment_id: parsed.data.paymentId || null,
      enrollment_id: parsed.data.enrollmentId || null,
      channel: parsed.data.channel,
      recipient: parsed.data.recipient || null,
      sent_by: user.id,
      meta: parsed.data.meta || {},
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (parsed.data.paymentId) {
      revalidatePath(`/receipts/${parsed.data.paymentId}`)
    }
    if (parsed.data.enrollmentId) {
      revalidatePath(`/candidates`)
    }

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to log share'
    return { success: false, error: message }
  }
}

export async function rotateReceiptShareTokenAction(
  paymentId: string
): Promise<ActionResult<{ newToken: string }>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data: newToken, error } = await supabase.rpc('rotate_share_token', {
      p_payment_id: paymentId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/receipts/${paymentId}`)
    return { success: true, data: { newToken: newToken as string } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to rotate token'
    return { success: false, error: message }
  }
}

export async function toggleReceiptShareEnabledAction(
  paymentId: string,
  enabled: boolean
): Promise<ActionResult<{ enabled: boolean }>> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('set_payment_share_enabled', {
      p_payment_id: paymentId,
      p_enabled: enabled,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/receipts/${paymentId}`)
    return { success: true, data: { enabled: Boolean(data) } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update share state'
    return { success: false, error: message }
  }
}

export async function sendReceiptEmailAction(params: {
  paymentId: string
  recipientEmail: string
}): Promise<EmailSendResult> {
  try {
    const { user } = await requireUser()

    const emailSchema = z.string().trim().email('Please enter a valid recipient email address')
    const parsedEmail = emailSchema.safeParse(params.recipientEmail)
    if (!parsedEmail.success) {
      return { success: false, error: parsedEmail.error.issues[0]?.message }
    }
    const recipient = parsedEmail.data

    const supabase = await createClient()

    // Query payment with relations
    const { data: payment, error: pError } = await supabase
      .from('payments')
      .select(`
        *,
        student:students(
          id,
          full_name,
          student_code,
          mobile,
          email,
          guardian_name,
          guardian_email
        ),
        enrollment:enrollments(
          id,
          intake,
          total_fee,
          discount,
          opening_paid,
          university:universities(name),
          course:courses(name),
          specialization:specializations(name)
        ),
        received_by_profile:profiles!payments_received_by_fkey(full_name),
        voided_by_profile:profiles!payments_voided_by_fkey(full_name)
      `)
      .eq('id', params.paymentId)
      .single()

    if (pError || !payment) {
      return { success: false, error: 'Payment receipt not found' }
    }

    // 1. Atomic rate-limit check via RPC (20/hr per user)
    const { error: rateLimitError } = await supabase.rpc(
      'check_and_log_email_rate_limit',
      {
        p_recipient: recipient,
        p_email_type: 'receipt',
        p_reference_id: payment.receipt_no,
      }
    )

    if (rateLimitError) {
      return { success: false, error: rateLimitError.message }
    }

    // 2. Fetch company settings
    const { data: settings } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .single()

    const companySettings = {
      name: settings?.name ?? 'EduBridge Education',
      address:
        settings?.address ??
        'M03, Royal House Building, Hor Al Anz East, Dubai – UAE',
      phone: settings?.phone ?? '+971 58 107 3898',
      email: settings?.email ?? 'info@edubridgeeducation.com',
      website: settings?.website ?? 'https://edubridgeeducation.com',
      trn: settings?.trn ?? '105215478600003',
      footer_note:
        settings?.footer_note ??
        'Keep your receipt vouchers for future references.',
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'https://edubridgeeducation.com'
    const publicLink = `${appUrl}/r/${payment.share_token}`

    // 3. Render PDF buffer server-side
    const qrCodeDataUrl = await QRCode.toDataURL(publicLink, {
      margin: 1,
      width: 120,
    })

    const studentData = payment.student!
    const enrollmentData = payment.enrollment!

    const { data: billingAddress } = await supabase
      .from('student_addresses')
      .select('contact_name, contact_phone, line1, line2, city, state, postal_code, country')
      .eq('student_id', studentData.id)
      .eq('type', 'billing')
      .eq('is_default', true)
      .maybeSingle()

    const docProps = {
      payment: {
        id: payment.id,
        receipt_no: payment.receipt_no,
        amount: Number(payment.amount),
        mode: payment.mode,
        purpose: payment.purpose,
        purpose_note: payment.purpose_note,
        reference_no: payment.reference_no,
        paid_at: payment.paid_at,
        payee_name: payment.payee_name,
        comments: payment.comments,
        status: payment.status,
        fee_snapshot: Number(payment.fee_snapshot),
        paid_before_snapshot: Number(payment.paid_before_snapshot),
        balance_after_snapshot: Number(payment.balance_after_snapshot),
        vat_amount: Number(payment.vat_amount),
        vat_type: payment.vat_type,
        vat_rate: Number(payment.vat_rate),
        share_token: payment.share_token,
        void_reason: payment.void_reason,
        voided_at: payment.voided_at,
      },
      student: {
        full_name: studentData.full_name,
        student_code: studentData.student_code,
        mobile: studentData.mobile,
        email: studentData.email,
      },
      enrollment: {
        university_name: enrollmentData.university?.name ?? 'University',
        course_name: enrollmentData.course?.name ?? 'Course',
        specialization_name: enrollmentData.specialization?.name,
        intake: enrollmentData.intake,
        total_fee: Number(enrollmentData.total_fee),
        discount: Number(enrollmentData.discount),
      },
      settings: companySettings,
      billingAddress: billingAddress ?? null,
      opening_paid: enrollmentData.opening_paid ? Number(enrollmentData.opening_paid) : 0,
      receivedByName: payment.received_by_profile?.full_name ?? 'EduBridge Staff',
      voidedByName: payment.voided_by_profile?.full_name,
      qrCodeDataUrl,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(ReceiptDocument(docProps) as any)

    // 4. Send email via Resend
    const sendResult = await sendReceiptEmail({
      to: recipient,
      replyTo: companySettings.email,
      receiptNo: payment.receipt_no,
      studentName: payment.payee_name || studentData.full_name,
      candidateCode: studentData.student_code,
      amount: Number(payment.amount),
      balance: Number(payment.balance_after_snapshot),
      publicLink,
      pdfBuffer: Buffer.from(pdfBuffer),
      subjectTemplate: settings?.email_subject_template,
      bodyTemplate: settings?.email_body_template,
      companyName: companySettings.name,
      companyAddress: companySettings.address,
      companyTrn: companySettings.trn,
    })

    // 5. If sent via Resend, log to share_logs
    if (sendResult.success) {
      await supabase.from('share_logs').insert({
        payment_id: payment.id,
        enrollment_id: payment.enrollment_id,
        channel: 'email',
        recipient,
        sent_by: user.id,
        meta: {
          receipt_no: payment.receipt_no,
          format: 'pdf_attachment',
        },
      })
      revalidatePath(`/receipts/${payment.id}`)
      revalidatePath(`/candidates/${studentData.id}`)
    }

    return sendResult
  } catch (err: unknown) {
    console.error('sendReceiptEmailAction error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send receipt email'
    return { success: false, error: message }
  }
}
