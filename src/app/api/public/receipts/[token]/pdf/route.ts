import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReceiptDocument } from '@/lib/pdf/receipt-document'

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
      return new NextResponse('Receipt not found', { status: 404 })
    }

    const admin = createAdminClient()

    // 1. Validate token via get_public_receipt RPC
    const { data: voucher, error: rpcError } = await admin.rpc('get_public_receipt', {
      p_token: token,
    })

    if (rpcError || !voucher) {
      return new NextResponse('Receipt voucher not found or link has expired/been disabled', {
        status: 404,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = voucher as any
    const paidYear = new Date(v.paid_at).getFullYear()
    const storagePath = `${paidYear}/${v.receipt_no}.pdf`

    // 2. Check if file exists in storage or create signed URL
    let { data: signedData, error: signError } = await admin.storage
      .from('receipts')
      .createSignedUrl(storagePath, 300)

    // If file is not yet rendered in storage, generate buffer and upload
    if (signError || !signedData?.signedUrl) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
      const qrTargetUrl = `${appUrl}/r/${token}`
      const qrCodeDataUrl = await QRCode.toDataURL(qrTargetUrl, {
        margin: 1,
        width: 120,
      })

      const docProps = {
        payment: {
          id: '',
          receipt_no: v.receipt_no,
          amount: Number(v.amount),
          mode: v.mode,
          purpose: v.purpose,
          purpose_note: v.purpose_note,
          reference_no: v.reference_no,
          paid_at: v.paid_at,
          payee_name: v.payee_name,
          comments: v.comments,
          status: v.status,
          fee_snapshot: Number(v.fee_snapshot),
          paid_before_snapshot: Number(v.paid_before_snapshot),
          balance_after_snapshot: Number(v.balance_after_snapshot),
          vat_amount: Number(v.vat_amount ?? 0),
          taxable_amount: v.taxable_amount != null ? Number(v.taxable_amount) : Number(v.amount) - Number(v.vat_amount ?? 0),
          vat_treatment: v.vat_treatment || 'exclusive',
          vat_type: v.vat_treatment || 'exclusive',
          vat_rate: Number(v.vat_rate ?? 5),
          no_vat_reason: v.no_vat_reason,
          share_token: token,
          void_reason: v.void_reason,
          voided_at: v.voided_at,
        },
        student: {
          full_name: v.student_name,
          student_code: v.student_code,
          mobile: '',
          email: '',
        },
        enrollment: {
          university_name: v.university_name,
          course_name: v.course_name,
          specialization_name: v.specialization_name,
          intake: null,
          total_fee: Number(v.fee_snapshot),
          discount: 0,
        },
        settings: {
          name: v.company?.name ?? 'EduBridge Education',
          address:
            v.company?.address ??
            'M03, Royal House Building, Hor Al Anz East, Dubai – UAE',
          phone: v.company?.phone ?? '+971 58 107 3898',
          email: v.company?.email ?? 'info@edubridgeeducation.com',
          website: v.company?.website ?? 'https://edubridgeeducation.com',
          trn: v.company?.trn ?? '105215478600003',
          footer_note:
            v.company?.footer_note ??
            'Keep your receipt vouchers for future references.',
          vat_enabled: v.company?.vat_enabled !== false,
        },
        billingAddress: null,
        opening_paid: 0,
        receivedByName: v.receiver_name ?? 'EduBridge Staff',
        voidedByName: null,
        qrCodeDataUrl,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(ReceiptDocument(docProps) as any)

      await admin.storage.from('receipts').upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

      const retrySign = await admin.storage
        .from('receipts')
        .createSignedUrl(storagePath, 300)

      signedData = retrySign.data
      signError = retrySign.error
    }

    if (signError || !signedData?.signedUrl) {
      return new NextResponse('Error generating signed download URL', { status: 500 })
    }

    // 3. Redirect to 5-minute signed storage URL (never expose direct bucket path)
    return NextResponse.redirect(signedData.signedUrl, 307)
  } catch (err: unknown) {
    console.error('Public receipt PDF error:', err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
