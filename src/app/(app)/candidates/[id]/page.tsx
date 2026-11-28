import React from 'react'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  StudentDetailClient,
  type EnrollmentDetail,
  type PaymentItem,
  type ShareLogItem,
  type AuditLogItem,
} from './StudentDetailClient'
import type { StudentAddress } from './ContactsAndAddressesCard'

interface StudentPageProps {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: StudentPageProps) {
  const { id } = await params
  const { user, profile } = await requireUser()
  const isOwner = profile.role === 'super_admin' || profile.role === 'admin' || profile.role === 'owner'
  const supabase = await createClient()

  // 1. Fetch student, addresses, enrollments, ledger, payments, metadata & documents in parallel
  const [
    { data: student, error: studentError },
    { data: rawAddresses },
    { data: rawEnrollments },
    { data: rawLedger },
    { data: rawPayments },
    { data: universitiesData },
    { data: coursesData },
    { data: specializationsData },
    { data: staffData },
    { data: settingsData },
    { data: rawDocTypes },
    { data: rawCandidateDocs },
    { data: rawUploadLinks },
  ] = await Promise.all([
    supabase
      .from('students')
      .select(`
        id,
        student_code,
        full_name,
        mobile,
        whatsapp,
        email,
        notes,
        guardian_name,
        guardian_relation,
        guardian_phone,
        guardian_whatsapp,
        guardian_email,
        created_at,
        created_by,
        creator_profile:profiles!students_created_by_fkey ( full_name, role )
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('student_addresses')
      .select('id, student_id, type, contact_name, contact_phone, line1, line2, city, state, postal_code, country, is_default')
      .eq('student_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('enrollments')
      .select(`
        id,
        student_id,
        university_id,
        course_id,
        specialization_id,
        intake,
        total_fee,
        discount,
        status,
        vat_treatment,
        vat_rate,
        no_vat_reason,
        opening_paid,
        opening_paid_note,
        share_token,
        share_enabled,
        created_at,
        admission_staff_id,
        universities ( name ),
        courses ( name, level ),
        specializations ( name ),
        admission_staff:profiles!enrollments_admission_staff_id_fkey ( full_name )
      `)
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('enrollment_ledger')
      .select('enrollment_id, total_fee, discount, net_fee, taxable, vat_total, total_payable, total_paid, balance, vat_treatment, vat_rate, no_vat_reason, opening_paid, opening_paid_note, payment_count, last_payment_at')
      .eq('student_id', id),
    supabase
      .from('payments')
      .select(`
        id,
        receipt_no,
        enrollment_id,
        amount,
        mode,
        purpose,
        purpose_note,
        reference_no,
        paid_at,
        status,
        void_reason,
        voided_at,
        balance_after_snapshot,
        vat_amount,
        taxable_amount,
        vat_treatment,
        vat_rate,
        received_by_profile:profiles!payments_received_by_fkey ( full_name ),
        voided_by_profile:profiles!payments_voided_by_fkey ( full_name )
      `)
      .eq('student_id', id)
      .order('paid_at', { ascending: false }),
    supabase
      .from('universities')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('courses')
      .select('id, university_id, name, level, default_fee')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('specializations')
      .select('id, course_id, name, default_fee')
      .eq('is_active', true)
      .order('name'),
    isOwner
      ? supabase
        .from('profiles')
        .select('id, full_name, role, job_title, is_sales_team')
        .eq('is_active', true)
        .order('full_name')
      : Promise.resolve({ data: [] }),
    supabase
      .from('company_settings')
      .select('vat_enabled, vat_rate, default_vat_treatment, no_vat_reason')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('document_types')
      .select('id, name, slug, helper_text, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('candidate_documents')
      .select(`
        id,
        student_id,
        document_type_id,
        title,
        file_path,
        file_name,
        size_bytes,
        original_size_bytes,
        mime_type,
        id_proof_kind,
        status,
        notes,
        uploaded_via,
        uploaded_by,
        verified_by,
        verified_at,
        created_at,
        archived_at,
        uploader:profiles!candidate_documents_uploaded_by_fkey ( full_name ),
        verifier:profiles!candidate_documents_verified_by_fkey ( full_name )
      `)
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('document_upload_links')
      .select('id, token, requested_types, expires_at, revoked_at, created_at, upload_count')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (studentError || !student) {
    notFound()
  }

  const enrollmentsList = rawEnrollments || []
  const enrollmentIds = enrollmentsList.map((e) => e.id)

  const ledgerMap = new Map((rawLedger || []).map((l) => [l.enrollment_id, l]))

  const enrollments: EnrollmentDetail[] = enrollmentsList.map((enr) => {
    const l = ledgerMap.get(enr.id)
    return {
      id: enr.id,
      student_id: enr.student_id,
      university_id: enr.university_id,
      course_id: enr.course_id,
      specialization_id: enr.specialization_id,
      intake: enr.intake,
      total_fee: Number(enr.total_fee),
      discount: Number(enr.discount),
      status: enr.status,
      vat_treatment: (enr.vat_treatment as 'exclusive' | 'inclusive' | 'none') || 'exclusive',
      vat_rate: Number(enr.vat_rate ?? 5),
      no_vat_reason: enr.no_vat_reason as 'zero_rated' | 'exempt' | 'out_of_scope' | null,
      share_token: enr.share_token,
      share_enabled: enr.share_enabled,
      created_at: enr.created_at,
      university: enr.universities as { name: string } | null,
      course: enr.courses as { name: string; level: string } | null,
      specialization: enr.specializations as { name: string } | null,
      admission_staff: enr.admission_staff as { full_name: string } | null,
      ledger: {
        total_fee: l ? Number(l.total_fee) : Number(enr.total_fee),
        discount: l ? Number(l.discount) : Number(enr.discount),
        net_fee: l ? Number(l.net_fee) : Number(enr.total_fee) - Number(enr.discount),
        taxable: l ? Number(l.taxable) : undefined,
        vat_total: l ? Number(l.vat_total) : undefined,
        total_payable: l ? Number(l.total_payable) : Number(enr.total_fee) - Number(enr.discount),
        total_paid: l ? Number(l.total_paid) : Number(enr.opening_paid || 0),
        balance: l ? Number(l.balance) : Number(enr.total_fee) - Number(enr.discount) - Number(enr.opening_paid || 0),
        vat_treatment: (l?.vat_treatment ?? enr.vat_treatment ?? 'exclusive') as 'exclusive' | 'inclusive' | 'none',
        vat_rate: l ? Number(l.vat_rate) : Number(enr.vat_rate ?? 5),
        no_vat_reason: (l?.no_vat_reason ?? enr.no_vat_reason ?? null) as 'zero_rated' | 'exempt' | 'out_of_scope' | null,
        opening_paid: l ? Number(l.opening_paid) : Number(enr.opening_paid || 0),
        opening_paid_note: l?.opening_paid_note ?? enr.opening_paid_note ?? null,
        payment_count: l ? Number(l.payment_count) : 0,
        last_payment_at: l?.last_payment_at || null,
      },
    }
  })

  const payments: PaymentItem[] = (rawPayments || []).map((p) => ({
    id: p.id,
    receipt_no: p.receipt_no,
    enrollment_id: p.enrollment_id,
    amount: Number(p.amount),
    mode: p.mode,
    purpose: p.purpose,
    purpose_note: p.purpose_note,
    reference_no: p.reference_no,
    paid_at: p.paid_at,
    status: p.status as 'valid' | 'void',
    void_reason: p.void_reason,
    voided_at: p.voided_at,
    balance_after_snapshot: Number(p.balance_after_snapshot),
    vat_amount: p.vat_amount != null ? Number(p.vat_amount) : null,
    taxable_amount: p.taxable_amount != null ? Number(p.taxable_amount) : null,
    vat_treatment: p.vat_treatment,
    received_by_profile: p.received_by_profile as { full_name: string } | null,
    voided_by_profile: p.voided_by_profile as { full_name: string } | null,
  }))

  // 2. Fetch share logs and audit logs in parallel (only when enrollments exist)
  const [{ data: rawShareLogs }, { data: rawAuditLogs }] =
    enrollmentIds.length > 0
      ? await Promise.all([
        supabase
          .from('share_logs')
          .select(`
              id,
              payment_id,
              enrollment_id,
              channel,
              recipient,
              sent_at,
              sent_by_profile:profiles!share_logs_sent_by_fkey ( full_name )
            `)
          .in('enrollment_id', enrollmentIds)
          .order('sent_at', { ascending: false })
          .limit(20),
        supabase
          .from('audit_log')
          .select('id, row_id, action, at, diff')
          .eq('table_name', 'enrollments')
          .in('row_id', enrollmentIds)
          .order('at', { ascending: false })
          .limit(20),
      ])
      : [{ data: [] }, { data: [] }]

  const shareLogs: ShareLogItem[] = (rawShareLogs || []).map((s) => ({
    id: s.id,
    payment_id: s.payment_id,
    enrollment_id: s.enrollment_id,
    channel: s.channel,
    recipient: s.recipient,
    sent_at: s.sent_at,
    sent_by_profile: s.sent_by_profile as { full_name: string } | null,
  }))

  const auditLogs: AuditLogItem[] = (rawAuditLogs || []).map((a) => ({
    id: a.id,
    row_id: a.row_id,
    action: a.action,
    at: a.at,
    diff: (a.diff as AuditLogItem['diff']) || null,
  }))

  const documents = (rawCandidateDocs || []).map((d) => {
    const uploaderObj = Array.isArray(d.uploader) ? d.uploader[0] : d.uploader
    const verifierObj = Array.isArray(d.verifier) ? d.verifier[0] : d.verifier
    return {
      ...d,
      id_proof_kind: d.id_proof_kind as 'aadhaar_masked' | 'passport' | null,
      status: d.status as 'received' | 'verified' | 'rejected',
      uploaded_via: d.uploaded_via as 'staff' | 'candidate_link',
      uploader_name: (uploaderObj as { full_name?: string } | null)?.full_name || null,
      verifier_name: (verifierObj as { full_name?: string } | null)?.full_name || null,
    }
  })

  const isAdmissionStaff =
    enrollmentsList.some((e) => e.admission_staff_id === user.id) || student.created_by === user.id
  const isOwnerOrAdmissionStaff = isOwner || isAdmissionStaff

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const studentData = {
    id: student.id,
    student_code: student.student_code,
    full_name: student.full_name,
    mobile: student.mobile,
    whatsapp: student.whatsapp,
    email: student.email,
    notes: student.notes,
    guardian_name: student.guardian_name,
    guardian_relation: student.guardian_relation,
    guardian_phone: student.guardian_phone,
    guardian_whatsapp: student.guardian_whatsapp,
    guardian_email: student.guardian_email,
    created_at: student.created_at,
    created_by: student.created_by,
    creator_profile: student.creator_profile as { full_name: string; role: string } | null,
  }

  return (
    <StudentDetailClient
      student={studentData}
      addresses={(rawAddresses as StudentAddress[]) || []}
      enrollments={enrollments}
      payments={payments}
      shareLogs={shareLogs}
      auditLogs={auditLogs}
      universities={universitiesData || []}
      courses={coursesData || []}
      specializations={specializationsData || []}
      staffList={staffData || []}
      documentTypes={rawDocTypes || []}
      documents={documents}
      uploadLinks={rawUploadLinks || []}
      isOwnerOrAdmissionStaff={isOwnerOrAdmissionStaff}
      currentUserId={user.id}
      isOwner={isOwner}
      settings={settingsData}
      appUrl={appUrl}
    />
  )
}
