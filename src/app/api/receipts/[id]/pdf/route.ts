import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { ReceiptDocument } from '@/lib/pdf/receipt-document'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser()
    const { id } = await params

    const supabase = await createClient()

    // Query payment with student, enrollment, university, course
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        student:students(
          id,
          full_name,
          student_code,
          mobile,
          email
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
        received_by_profile:profiles!payments_received_by_fkey(
          full_name
        ),
        voided_by_profile:profiles!payments_voided_by_fkey(
          full_name
        )
      `)
      .eq('id', id)
      .single()

    if (paymentError || !payment) {
      return new NextResponse('Receipt not found', { status: 404 })
    }

    // Query company settings
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
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

    // Generate QR Code data URL
    const qrTargetUrl = `${appUrl}/r/${payment.share_token}`
    const qrCodeDataUrl = await QRCode.toDataURL(qrTargetUrl, {
      margin: 1,
      width: 120,
    })

    const studentData = payment.student!
    const enrollmentData = payment.enrollment!

    // Query billing address if present
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
      receivedByName:
        payment.received_by_profile?.full_name ?? 'EduBridge Staff',
      voidedByName: payment.voided_by_profile?.full_name,
      qrCodeDataUrl,
    }

    // Render PDF buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ReceiptDocument(docProps) as any)

    // Save to private Supabase Storage bucket and update payment pdf_path
    const paidYear = new Date(payment.paid_at).getFullYear()
    const storagePath = `${paidYear}/${payment.receipt_no}.pdf`

    const admin = createAdminClient()

    // Upload/upsert PDF in storage
    const { error: uploadError } = await admin.storage
      .from('receipts')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (!uploadError && !payment.pdf_path) {
      await admin
        .from('payments')
        .update({ pdf_path: storagePath })
        .eq('id', payment.id)
    }

    // Log download in share_logs
    await admin.from('share_logs').insert({
      payment_id: payment.id,
      enrollment_id: payment.enrollment_id,
      channel: 'download',
      sent_by: user.id,
      recipient: payment.payee_name || studentData.full_name,
      meta: {
        receipt_no: payment.receipt_no,
        format: 'pdf',
      },
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${payment.receipt_no}.pdf"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    })
  } catch (err: unknown) {
    console.error('Error generating receipt PDF:', err)
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return new NextResponse(`Error generating PDF: ${message}`, { status: 500 })
  }
}
