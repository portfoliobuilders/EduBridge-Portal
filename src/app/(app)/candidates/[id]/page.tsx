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
  const isOwner = profile.role === 'owner'
  const supabase = await createClient()

  // 1. Fetch student record with guardian details
  const { data: student, error: studentError } = await supabase
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
    .single()

  if (studentError || !student) {
    notFound()
  }

  // 2. Fetch student's addresses
  const { data: rawAddresses } = await supabase
    .from('student_addresses')
    .select('*')
    .eq('student_id', id)
    .order('created_at', { ascending: true })

  // 3. Fetch student's enrollments
  const { data: rawEnrollments } = await supabase
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
    .order('created_at', { ascending: false })

  const enrollmentsList = rawEnrollments || []
  const enrollmentIds = enrollmentsList.map((e) => e.id)

  // 4. Fetch enrollment ledger views for accurate financial metrics
  const { data: rawLedger } = await supabase
    .from('enrollment_ledger')
    .select('*')
    .eq('student_id', id)

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
        total_paid: l ? Number(l.total_paid) : Number(enr.opening_paid || 0),
        balance: l ? Number(l.balance) : Number(enr.total_fee) - Number(enr.discount) - Number(enr.opening_paid || 0),
        opening_paid: l ? Number(l.opening_paid) : Number(enr.opening_paid || 0),
        opening_paid_note: l?.opening_paid_note ?? enr.opening_paid_note ?? null,
        payment_count: l ? Number(l.payment_count) : 0,
        last_payment_at: l?.last_payment_at || null,
      },
    }
  })

  // 5. Fetch all payments for this student
  const { data: rawPayments } = await supabase
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
      received_by_profile:profiles!payments_received_by_fkey ( full_name ),
      voided_by_profile:profiles!payments_voided_by_fkey ( full_name )
    `)
    .eq('student_id', id)
    .order('paid_at', { ascending: false })

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
    received_by_profile: p.received_by_profile as { full_name: string } | null,
    voided_by_profile: p.voided_by_profile as { full_name: string } | null,
  }))

  // 6. Fetch share logs & audit logs for activity timeline
  const fallbackId = '00000000-0000-0000-0000-000000000000'
  const targetIds = enrollmentIds.length > 0 ? enrollmentIds : [fallbackId]

  const [{ data: rawShareLogs }, { data: rawAuditLogs }] = await Promise.all([
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
      .in('enrollment_id', targetIds)
      .order('sent_at', { ascending: false })
      .limit(20),
    supabase
      .from('audit_log')
      .select('id, row_id, action, at, diff')
      .eq('table_name', 'enrollments')
      .in('row_id', targetIds)
      .order('at', { ascending: false })
      .limit(20),
  ])

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

  // 7. Metadata for add-enrollment modal & documents
  const [
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
          .select('id, full_name, role, job_title')
          .eq('is_active', true)
          .order('full_name')
      : Promise.resolve({ data: [] }),
    supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('document_types')
      .select('id, name, slug, helper_text, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('candidate_documents')
      .select('*')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('document_upload_links')
      .select('id, token, requested_types, expires_at, revoked_at, created_at, upload_count')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
  ])

  // Collect user IDs for uploader and verifier profiles
  const docUserIds = new Set<string>()
  ;(rawCandidateDocs || []).forEach((d) => {
    if (d.uploaded_by) docUserIds.add(d.uploaded_by)
    if (d.verified_by) docUserIds.add(d.verified_by)
  })

  let userProfilesMap = new Map<string, string>()
  if (docUserIds.size > 0) {
    const { data: userProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(docUserIds))
    if (userProfiles) {
      userProfilesMap = new Map(userProfiles.map((p) => [p.id, p.full_name]))
    }
  }

  const documents = (rawCandidateDocs || []).map((d) => ({
    ...d,
    id_proof_kind: d.id_proof_kind as 'aadhaar_masked' | 'passport' | null,
    status: d.status as 'received' | 'verified' | 'rejected',
    uploaded_via: d.uploaded_via as 'staff' | 'candidate_link',
    uploader_name: d.uploaded_by ? userProfilesMap.get(d.uploaded_by) || null : null,
    verifier_name: d.verified_by ? userProfilesMap.get(d.verified_by) || null : null,
  }))

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
