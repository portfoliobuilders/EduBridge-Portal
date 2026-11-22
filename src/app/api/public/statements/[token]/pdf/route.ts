import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatementDocument } from '@/lib/pdf/statement-document'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)

    if (!isUuid) {
      return new NextResponse('Statement not found', { status: 404 })
    }

    const admin = createAdminClient()

    // 1. Validate token via get_public_statement RPC
    const { data: statement, error: rpcError } = await admin.rpc('get_public_statement', {
      p_token: token,
    })

    if (rpcError || !statement) {
      return new NextResponse(
        'Statement not found or link has expired/been disabled',
        { status: 404 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = statement as any
    const year = new Date().getFullYear()
    const storagePath = `${year}/${s.statement_no}.pdf`

    // 2. Check if file exists in storage or create signed URL
    let { data: signedData, error: signError } = await admin.storage
      .from('statements')
      .createSignedUrl(storagePath, 300)

    if (signError || !signedData?.signedUrl) {
      const docProps = {
        enrollment: {
          id: s.enrollment_id,
          intake: s.intake,
          total_fee: Number(s.total_fee),
          discount: Number(s.discount),
          vat_type: s.vat_type ?? 'standard',
          vat_treatment: s.vat_treatment || s.vat_type || 'exclusive',
          vat_rate: Number(s.vat_rate ?? 0),
          no_vat_reason: s.no_vat_reason,
          university_name: s.university_name,
          course_name: s.course_name,
          specialization_name: s.specialization_name,
        },
        student: {
          full_name: s.student_name,
          student_code: s.student_code,
          mobile: '',
          email: '',
        },
        ledger: {
          net_fee: Number(s.net_fee),
          taxable: Number(s.taxable ?? s.net_fee),
          vat_amount: Number(s.vat_amount),
          vat_total: Number(s.vat_total ?? s.vat_amount),
          total_payable: Number(s.total_payable),
          total_paid: Number(s.total_paid),
          balance: Number(s.balance),
          opening_paid: Number(s.opening_paid ?? 0),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payments: (s.payments ?? []).map((p: any) => ({
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
        settings: {
          name: s.company?.name ?? 'EduBridge Education',
          address:
            s.company?.address ??
            'M03, Royal House Building, Hor Al Anz East, Dubai – UAE',
          phone: s.company?.phone ?? '+971 58 107 3898',
          email: s.company?.email ?? 'info@edubridgeeducation.com',
          website: s.company?.website ?? 'https://edubridgeeducation.com',
          trn: s.company?.trn ?? '105215478600003',
          footer_note:
            s.company?.footer_note ??
            'Keep your receipt vouchers for future references.',
          statement_prefix: 'EB-FS',
          vat_enabled: s.company?.vat_enabled !== false,
        },
        billingAddress: s.billing_address ?? null,
        statementNo: s.statement_no,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(StatementDocument(docProps) as any)

      await admin.storage.from('statements').upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

      const retrySign = await admin.storage
        .from('statements')
        .createSignedUrl(storagePath, 300)

      signedData = retrySign.data
      signError = retrySign.error
    }

    if (signError || !signedData?.signedUrl) {
      return new NextResponse('Error generating signed download URL', { status: 500 })
    }

    // 3. Redirect to 5-minute signed storage URL
    return NextResponse.redirect(signedData.signedUrl, 307)
  } catch (err: unknown) {
    console.error('Public statement PDF error:', err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
