import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { StatementDocument } from '@/lib/pdf/statement-document'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> }
) {
  try {
    const { user } = await requireUser()
    const { enrollmentId } = await params

    const supabase = await createClient()

    // Query enrollment with student, university, course, specialization
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select(`
        id,
        intake,
        total_fee,
        discount,
        vat_type,
        vat_rate,
        status,
        student:students!inner(
          id,
          full_name,
          student_code,
          mobile,
          email
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
      .eq('id', enrollmentId)
      .single()

    if (enrollmentError || !enrollment) {
      return new NextResponse('Enrollment not found', { status: 404 })
    }

    // Query enrollment ledger
    const { data: ledger } = await supabase
      .from('enrollment_ledger')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .single()

    // Query all payments for this enrollment
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('paid_at', { ascending: true })

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
      statement_prefix: settings?.statement_prefix ?? 'EB-FS',
    }

    const year = new Date().getFullYear()
    const statementNo = `${companySettings.statement_prefix}-${year}-${enrollment.id.slice(0, 6).toUpperCase()}`

    const docProps = {
      enrollment: {
        id: enrollment.id,
        intake: enrollment.intake,
        total_fee: Number(enrollment.total_fee),
        discount: Number(enrollment.discount),
        vat_type: enrollment.vat_type,
        vat_rate: Number(enrollment.vat_rate),
        university_name: enrollment.university.name,
        course_name: enrollment.course.name,
        specialization_name: enrollment.specialization?.name,
      },
      student: {
        full_name: enrollment.student.full_name,
        student_code: enrollment.student.student_code,
        mobile: enrollment.student.mobile,
        email: enrollment.student.email,
      },
      ledger: {
        net_fee: Number(
          ledger?.net_fee ?? enrollment.total_fee - enrollment.discount
        ),
        vat_amount: Number(ledger?.vat_amount ?? 0),
        total_payable: Number(
          ledger?.total_payable ?? enrollment.total_fee - enrollment.discount
        ),
        total_paid: Number(ledger?.total_paid ?? 0),
        balance: Number(
          ledger?.balance ?? enrollment.total_fee - enrollment.discount
        ),
      },
      payments: (payments ?? []).map((p) => ({
        id: p.id,
        receipt_no: p.receipt_no,
        amount: Number(p.amount),
        mode: p.mode,
        purpose: p.purpose,
        purpose_note: p.purpose_note,
        reference_no: p.reference_no,
        paid_at: p.paid_at,
        status: p.status,
      })),
      settings: companySettings,
      statementNo,
    }

    // Render PDF buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(StatementDocument(docProps) as any)

    // Log download in share_logs
    const admin = createAdminClient()
    await admin.from('share_logs').insert({
      enrollment_id: enrollment.id,
      channel: 'download',
      sent_by: user.id,
      recipient: enrollment.student.full_name,
      meta: {
        statement_no: statementNo,
        format: 'pdf',
      },
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Statement-${enrollment.student.student_code}.pdf"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    })
  } catch (err: unknown) {
    console.error('Error generating statement PDF:', err)
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return new NextResponse(`Error generating PDF: ${message}`, { status: 500 })
  }
}
