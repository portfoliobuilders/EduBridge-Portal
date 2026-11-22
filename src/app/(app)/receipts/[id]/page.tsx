import React from 'react'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { ReceiptDetailView } from '@/components/receipts/ReceiptDetailView'

export const dynamic = 'force-dynamic'

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { profile } = await requireUser()
  const { id } = await params

  const supabase = await createClient()

  // Find payment by id or receipt_no
  const query = supabase
    .from('payments')
    .select(`
      *,
      student:students!inner(
        id,
        full_name,
        student_code,
        mobile,
        whatsapp,
        email,
        guardian_name,
        guardian_email,
        guardian_phone,
        guardian_whatsapp
      ),
      enrollment:enrollments!inner(
        id,
        intake,
        total_fee,
        discount,
        university:universities!inner(name),
        course:courses!inner(name),
        specialization:specializations(name)
      ),
      received_by_profile:profiles!payments_received_by_fkey(
        full_name
      ),
      voided_by_profile:profiles!payments_voided_by_fkey(
        full_name
      )
    `)

  // Check if id is UUID or receipt_no
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  const { data: payment } = isUuid
    ? await query.eq('id', id).single()
    : await query.eq('receipt_no', id).single()

  if (!payment) {
    notFound()
  }

  // Company settings
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
    whatsapp_receipt_template: settings?.whatsapp_receipt_template,
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const qrTargetUrl = `${appUrl}/r/${payment.share_token}`
  const qrCodeDataUrl = await QRCode.toDataURL(qrTargetUrl, {
    margin: 1,
    width: 120,
  })

  const canVoid =
    profile.role === 'super_admin' ||
    profile.role === 'owner' ||
    (profile.role === 'admin' && Boolean(settings?.admins_can_void))

  const student = payment.student
  const enrollment = payment.enrollment

  return (
    <div className="py-2">
      <ReceiptDetailView
        payment={{
          id: payment.id,
          receipt_no: payment.receipt_no,
          enrollment_id: payment.enrollment_id,
          student_id: payment.student_id,
          amount: Number(payment.amount),
          mode: payment.mode,
          purpose: payment.purpose,
          purpose_note: payment.purpose_note,
          reference_no: payment.reference_no,
          paid_at: payment.paid_at,
          received_by: payment.received_by,
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
          share_enabled: payment.share_enabled,
          void_reason: payment.void_reason,
          voided_at: payment.voided_at,
          voided_by: payment.voided_by,
        }}
        student={{
          id: student.id,
          full_name: student.full_name,
          student_code: student.student_code,
          mobile: student.mobile,
          whatsapp: student.whatsapp,
          email: student.email,
          guardian_name: student.guardian_name,
          guardian_email: student.guardian_email,
          guardian_phone: student.guardian_phone,
          guardian_whatsapp: student.guardian_whatsapp,
        }}
        enrollment={{
          id: enrollment.id,
          intake: enrollment.intake,
          total_fee: Number(enrollment.total_fee),
          discount: Number(enrollment.discount),
          university_name: enrollment.university.name,
          course_name: enrollment.course.name,
          specialization_name: enrollment.specialization?.name,
        }}
        settings={companySettings}
        receivedByName={
          payment.received_by_profile?.full_name ?? 'EduBridge Staff'
        }
        voidedByName={payment.voided_by_profile?.full_name}
        isOwner={canVoid}
        qrCodeDataUrl={qrCodeDataUrl}
        appUrl={appUrl}
      />
    </div>
  )
}
