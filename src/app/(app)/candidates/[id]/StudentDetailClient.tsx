'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BalancePill } from '@/components/BalancePill'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime } from '@/lib/date'
import {
  Phone,
  MessageSquare,
  Mail,
  Edit2,
  PlusCircle,
  Receipt,
  GraduationCap,
  User,
  Shield,
  Clock,
  Send,
  ExternalLink,
  FileText,
} from 'lucide-react'
import { EditStudentModal } from './EditStudentModal'
import { EditFeeModal } from './EditFeeModal'
import { AddEnrollmentModal } from './AddEnrollmentModal'
import { StatementShareActions } from '@/components/candidates/StatementShareActions'
import {
  ContactsAndAddressesCard,
  type StudentAddress,
} from './ContactsAndAddressesCard'
import {
  CandidateDocumentsTab,
  type DocumentTypeFull,
} from '@/components/documents/CandidateDocumentsTab'
import type { CandidateDocItem } from '@/components/documents/DocumentViewerModal'
import type { UploadLinkItem } from '@/components/documents/RequestDocumentsModal'
import type {
  UniversityOption,
  CourseOption,
  SpecializationOption,
  StaffOption,
} from '../CreateStudentSheet'

export interface EnrollmentDetail {
  id: string
  student_id: string
  university_id: string
  course_id: string
  specialization_id: string | null
  intake: string | null
  total_fee: number
  discount: number
  status: string
  vat_treatment?: 'exclusive' | 'inclusive' | 'none' | null
  vat_rate?: number | null
  no_vat_reason?: 'zero_rated' | 'exempt' | 'out_of_scope' | null
  share_token?: string | null
  share_enabled?: boolean | null
  created_at: string
  university: { name: string } | null
  course: { name: string; level: string } | null
  specialization: { name: string } | null
  admission_staff: { full_name: string } | null
  ledger: {
    total_fee: number
    discount: number
    net_fee: number
    taxable?: number
    vat_total?: number
    total_payable?: number
    total_paid: number
    balance: number
    vat_treatment?: 'exclusive' | 'inclusive' | 'none'
    vat_rate?: number
    no_vat_reason?: 'zero_rated' | 'exempt' | 'out_of_scope' | null
    opening_paid?: number
    opening_paid_note?: string | null
    payment_count: number
    last_payment_at: string | null
  }
}

export interface PaymentItem {
  id: string
  receipt_no: string
  enrollment_id: string
  amount: number
  mode: string
  purpose: string
  purpose_note: string | null
  reference_no: string | null
  paid_at: string
  status: 'valid' | 'void'
  void_reason: string | null
  voided_at: string | null
  balance_after_snapshot: number
  vat_amount?: number | null
  taxable_amount?: number | null
  vat_treatment?: string | null
  received_by_profile: { full_name: string } | null
  voided_by_profile: { full_name: string } | null
}

export interface ShareLogItem {
  id: string
  payment_id: string | null
  enrollment_id: string | null
  channel: string
  recipient: string | null
  sent_at: string
  sent_by_profile: { full_name: string } | null
}

export interface AuditLogItem {
  id: string
  row_id: string
  action: string
  at: string
  diff: {
    old_total_fee?: number
    new_total_fee?: number
    old_discount?: number
    new_discount?: number
    reason?: string
  } | null
}

interface StudentDetailClientProps {
  student: {
    id: string
    student_code: string
    full_name: string
    mobile: string
    whatsapp: string | null
    email: string | null
    notes: string | null
    guardian_name: string | null
    guardian_relation: string | null
    guardian_phone: string | null
    guardian_whatsapp: string | null
    guardian_email: string | null
    created_at: string
    created_by: string
    creator_profile: { full_name: string; role: string } | null
  }
  addresses: StudentAddress[]
  enrollments: EnrollmentDetail[]
  payments: PaymentItem[]
  shareLogs: ShareLogItem[]
  auditLogs: AuditLogItem[]
  universities: UniversityOption[]
  courses: CourseOption[]
  specializations: SpecializationOption[]
  staffList: StaffOption[]
  documentTypes?: DocumentTypeFull[]
  documents?: CandidateDocItem[]
  uploadLinks?: UploadLinkItem[]
  isOwnerOrAdmissionStaff?: boolean
  currentUserId: string
  isOwner: boolean
  settings?: {
    name?: string
    vat_enabled?: boolean | null
    vat_rate?: number | null
    default_vat_treatment?: string | null
    no_vat_reason?: string | null
    whatsapp_statement_template?: string | null
    whatsapp_doc_request_template?: string | null
  } | null
  appUrl?: string
}

export function StudentDetailClient({
  student,
  addresses,
  enrollments,
  payments,
  shareLogs,
  auditLogs,
  universities,
  courses,
  specializations,
  staffList,
  documentTypes = [],
  documents = [],
  uploadLinks = [],
  isOwnerOrAdmissionStaff = false,
  currentUserId,
  isOwner,
  settings,
  appUrl = 'http://localhost:3000',
}: StudentDetailClientProps) {
  const router = useRouter()
  const [activeMainTab, setActiveMainTab] = useState<'overview' | 'documents'>('overview')
  const [activeEnrollmentId, setActiveEnrollmentId] = useState<string>(
    enrollments[0]?.id || ''
  )
  const [editStudentOpen, setEditStudentOpen] = useState(false)
  const [editFeeOpen, setEditFeeOpen] = useState(false)
  const [addEnrollmentOpen, setAddEnrollmentOpen] = useState(false)

  // Document summary computation (exclude 'other' slug from denominator)
  const standardTypes = documentTypes.filter((t) => t.slug !== 'other')
  const uploadedTypeIds = new Set(
    documents.filter((d) => !d.archived_at).map((d) => d.document_type_id)
  )
  const uploadedStandardCount = standardTypes.filter((t) => uploadedTypeIds.has(t.id)).length
  const totalStandardCount = standardTypes.length
  const unverifiedDocsCount = documents.filter(
    (d) => !d.archived_at && d.status === 'received'
  ).length

  // Permission check: staff edit contact only if they created student; owner edits any
  const canEditContact = isOwner || student.created_by === currentUserId

  const activeEnrollment =
    enrollments.find((e) => e.id === activeEnrollmentId) || enrollments[0]

  // Filter payments for active enrollment
  const enrollmentPayments = activeEnrollment
    ? payments.filter((p) => p.enrollment_id === activeEnrollment.id)
    : []

  // Clean WhatsApp phone number (digits only for wa.me)
  const rawWhatsApp = student.whatsapp || student.mobile
  const waDigits = rawWhatsApp ? rawWhatsApp.replace(/\D/g, '') : ''

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* --------------------------------------------------------------------- */}
      {/* 1. STUDENT HEADER CARD                                                */}
      {/* --------------------------------------------------------------------- */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-[#E4E7E7]">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold text-[#0A0A0A]">
                {student.full_name}
              </h1>
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5]">
                {student.student_code}
              </span>
              <button
                type="button"
                onClick={() => setActiveMainTab('documents')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F5F6F6] text-[#0A0A0A] border border-[#E4E7E7] hover:border-[#00A57E] hover:text-[#00A57E] transition cursor-pointer"
                title="Click to view candidate documents"
              >
                <FileText className="h-3.5 w-3.5 text-[#00A57E]" />
                <span>Documents: {uploadedStandardCount} of {totalStandardCount} types uploaded</span>
                {unverifiedDocsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {unverifiedDocsCount} unverified
                  </span>
                )}
              </button>
            </div>

            {/* Quick Contact Links */}
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-[#6B7272]">
              {student.mobile && (
                <a
                  href={`tel:${student.mobile}`}
                  className="flex items-center gap-1.5 font-mono text-[#0A0A0A] hover:text-[#00A57E] transition py-1"
                >
                  <Phone className="h-3.5 w-3.5 text-[#00A57E]" />
                  <span>{student.mobile}</span>
                </a>
              )}

              {waDigits && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[#0A0A0A] hover:text-[#00A57E] transition py-1"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-[#00A57E]" />
                  <span>WhatsApp</span>
                </a>
              )}

              {student.email && (
                <a
                  href={`mailto:${student.email}`}
                  className="flex items-center gap-1.5 text-[#0A0A0A] hover:text-[#00A57E] transition py-1"
                >
                  <Mail className="h-3.5 w-3.5 text-[#00A57E]" />
                  <span className="truncate max-w-[200px]">{student.email}</span>
                </a>
              )}
            </div>

            {student.notes && (
              <p className="mt-2 text-xs text-[#6B7272] bg-[#F5F6F6] p-2.5 rounded-xl border border-[#E4E7E7]/60">
                <span className="font-semibold text-[#0A0A0A]">Notes: </span>
                {student.notes}
              </p>
            )}
          </div>

          {/* Edit Candidate Button */}
          <div className="flex items-center gap-2 shrink-0">
            {canEditContact ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditStudentOpen(true)}
                className="gap-1.5 min-h-[44px] text-xs border-[#E4E7E7]"
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Edit Candidate</span>
              </Button>
            ) : (
              <div
                title="Only the creator or owner can edit contact details"
                className="inline-block"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="gap-1.5 min-h-[44px] text-xs border-[#E4E7E7] opacity-60 cursor-not-allowed"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit Candidate</span>
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddEnrollmentOpen(true)}
              className="gap-1.5 min-h-[44px] text-xs border-[#E4E7E7]"
            >
              <PlusCircle className="h-3.5 w-3.5 text-[#00A57E]" />
              <span>Add Enrollment</span>
            </Button>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 1.2. TOP-LEVEL NAVIGATION TABS                                        */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-[#E4E7E7]">
        <button
          type="button"
          onClick={() => setActiveMainTab('overview')}
          className={`flex items-center gap-2 px-4 sm:px-5 py-3 rounded-t-xl text-xs sm:text-sm font-semibold transition min-h-[44px] border-b-2 -mb-[1px] ${activeMainTab === 'overview'
            ? 'border-[#00A57E] text-[#00A57E] bg-white'
            : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A] hover:bg-white/60'
            }`}
        >
          <Receipt className="h-4 w-4" />
          <span>Overview & Ledger</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('documents')}
          className={`flex items-center gap-2 px-4 sm:px-5 py-3 rounded-t-xl text-xs sm:text-sm font-semibold transition min-h-[44px] border-b-2 -mb-[1px] ${activeMainTab === 'documents'
            ? 'border-[#00A57E] text-[#00A57E] bg-white'
            : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A] hover:bg-white/60'
            }`}
        >
          <FileText className="h-4 w-4" />
          <span>Documents</span>
          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#E6F6F2] text-[#00805F]">
            {uploadedStandardCount}/{totalStandardCount}
          </span>
          {unverifiedDocsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              {unverifiedDocsCount}
            </span>
          )}
        </button>
      </div>

      {activeMainTab === 'documents' ? (
        <CandidateDocumentsTab
          studentId={student.id}
          studentName={student.full_name}
          studentCode={student.student_code}
          studentPhone={student.mobile}
          studentEmail={student.email}
          guardianPhone={student.guardian_phone}
          documentTypes={documentTypes}
          documents={documents}
          uploadLinks={uploadLinks}
          isOwnerOrAdmissionStaff={isOwnerOrAdmissionStaff}
          whatsappTemplate={settings?.whatsapp_doc_request_template || null}
          onRefresh={() => router.refresh()}
        />
      ) : (
        <>

          {/* --------------------------------------------------------------------- */}
          {/* 1.5. CONTACTS & ADDRESSES CARD                                         */}
          {/* --------------------------------------------------------------------- */}
          <ContactsAndAddressesCard
            studentId={student.id}
            canEdit={canEditContact}
            guardian={{
              guardian_name: student.guardian_name,
              guardian_relation: student.guardian_relation,
              guardian_phone: student.guardian_phone,
              guardian_whatsapp: student.guardian_whatsapp,
              guardian_email: student.guardian_email,
            }}
            addresses={addresses}
          />

          {/* --------------------------------------------------------------------- */}
          {/* 2. ENROLLMENT TABS                                                    */}
          {/* --------------------------------------------------------------------- */}
          {enrollments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E4E7E7] bg-white p-8 text-center">
              <p className="text-sm text-[#6B7272]">
                No enrollments recorded for this student yet.
              </p>
              <Button
                onClick={() => setAddEnrollmentOpen(true)}
                className="mt-3 bg-[#00A57E] text-white"
              >
                Add First Enrollment
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Enrollment Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[#E4E7E7]">
                {enrollments.map((enr) => {
                  const isActive = enr.id === activeEnrollment?.id
                  const title = [enr.university?.name, enr.course?.name]
                    .filter(Boolean)
                    .join(' — ')

                  return (
                    <button
                      key={enr.id}
                      onClick={() => setActiveEnrollmentId(enr.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-medium transition whitespace-nowrap border-b-2 min-h-[44px] ${isActive
                        ? 'border-[#00A57E] text-[#00A57E] font-semibold bg-white'
                        : 'border-transparent text-[#6B7272] hover:text-[#0A0A0A] hover:bg-white/60'
                        }`}
                    >
                      <GraduationCap className="h-4 w-4" />
                      <span>{title}</span>
                      {enr.intake && (
                        <span className="text-[10px] bg-[#F5F6F6] text-[#6B7272] px-1.5 py-0.5 rounded font-mono">
                          {enr.intake}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {activeEnrollment && (
                <div className="space-y-6">
                  {/* Program Overview & Owner Fee Adjustment Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F5F6F6]/60 p-4 rounded-xl border border-[#E4E7E7]">
                    <div>
                      <h3 className="text-sm font-semibold text-[#0A0A0A]">
                        {activeEnrollment.university?.name} · {activeEnrollment.course?.name}
                        {activeEnrollment.specialization && (
                          <span className="text-xs font-normal text-[#6B7272]">
                            {' '}
                            ({activeEnrollment.specialization.name})
                          </span>
                        )}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-[#6B7272]">
                        <span>Level: {activeEnrollment.course?.level || '—'}</span>
                        <span>•</span>
                        <span>Intake: {activeEnrollment.intake || 'Not specified'}</span>
                        <span>•</span>
                        <span>
                          Admitted by: {activeEnrollment.admission_staff?.full_name || 'Staff'}
                        </span>
                      </div>
                    </div>

                    {isOwner && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditFeeOpen(true)}
                        className="shrink-0 text-xs border-[#E4E7E7] hover:border-[#00A57E] min-h-[40px] gap-1.5"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Adjust Fee / Discount</span>
                      </Button>
                    )}
                  </div>

                  {/* Opening balance notice if present */}
                  {(activeEnrollment.ledger.opening_paid ?? 0) > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-[#E6F6F2] text-[#00805F] px-4 py-3 rounded-xl border border-[#CCEDE5]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Paid prior to system (Opening balance):</span>
                        <span className="font-mono font-bold text-sm">
                          {formatAED(activeEnrollment.ledger.opening_paid ?? 0)}
                        </span>
                        {activeEnrollment.ledger.opening_paid_note && (
                          <span className="text-[#6B7272] italic font-normal">
                            — {activeEnrollment.ledger.opening_paid_note}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#00805F]/80">Pre-system credit</span>
                    </div>
                  )}

                  {/* --------------------------------------------------------------- */}
                  {/* 3. SUMMARY KPI CARDS (from enrollment_ledger)                   */}
                  {/* --------------------------------------------------------------- */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="rounded-2xl bg-white p-4 border border-[#E4E7E7] shadow-sm">
                      <span className="text-xs font-medium text-[#6B7272]">Total Payable</span>
                      <div className="mt-1 font-mono text-lg sm:text-xl font-bold text-[#0A0A0A] tabular-nums">
                        {formatAED(activeEnrollment.ledger.total_payable ?? activeEnrollment.ledger.net_fee)}
                      </div>
                      <span className="text-[11px] text-[#6B7272] block truncate" title={
                        (activeEnrollment.ledger.vat_treatment || activeEnrollment.vat_treatment || 'exclusive') !== 'none'
                          ? `incl. VAT ${formatAED(activeEnrollment.ledger.vat_total ?? 0)} (${activeEnrollment.ledger.vat_rate ?? activeEnrollment.vat_rate ?? 5}%)`
                          : settings?.vat_enabled !== false
                            ? `No VAT (${(activeEnrollment.ledger.no_vat_reason || activeEnrollment.no_vat_reason) === 'exempt' ? 'Exempt' : (activeEnrollment.ledger.no_vat_reason || activeEnrollment.no_vat_reason) === 'out_of_scope' ? 'Out of scope' : 'Zero-rated'})`
                            : 'No VAT'
                      }>
                        {(activeEnrollment.ledger.vat_treatment || activeEnrollment.vat_treatment || 'exclusive') !== 'none'
                          ? `incl. VAT ${formatAED(activeEnrollment.ledger.vat_total ?? 0)} (${activeEnrollment.ledger.vat_rate ?? activeEnrollment.vat_rate ?? 5}%)`
                          : settings?.vat_enabled !== false
                            ? `No VAT (${(activeEnrollment.ledger.no_vat_reason || activeEnrollment.no_vat_reason) === 'exempt' ? 'Exempt' : (activeEnrollment.ledger.no_vat_reason || activeEnrollment.no_vat_reason) === 'out_of_scope' ? 'Out of scope' : 'Zero-rated'})`
                            : 'No VAT'}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-white p-4 border border-[#E4E7E7] shadow-sm">
                      <span className="text-xs font-medium text-[#6B7272]">Scholarship / Discount</span>
                      <div className="mt-1 font-mono text-lg sm:text-xl font-semibold text-[#0A0A0A] tabular-nums">
                        {formatAED(activeEnrollment.ledger.discount)}
                      </div>
                      <span className="text-[11px] text-[#6B7272]">
                        Net: {formatAED(activeEnrollment.ledger.net_fee)}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-white p-4 border border-[#E4E7E7] shadow-sm">
                      <span className="text-xs font-medium text-[#6B7272]">Total Paid</span>
                      <div className="mt-1 font-mono text-lg sm:text-xl font-semibold text-[#00805F] tabular-nums">
                        {formatAED(activeEnrollment.ledger.total_paid)}
                      </div>
                      <span className="text-[11px] text-[#6B7272]">
                        {(activeEnrollment.ledger.opening_paid ?? 0) > 0 ? (
                          <>
                            Opening AED {formatAED(activeEnrollment.ledger.opening_paid ?? 0)} · {activeEnrollment.ledger.payment_count} voucher{activeEnrollment.ledger.payment_count === 1 ? '' : 's'}
                          </>
                        ) : (
                          <>
                            {activeEnrollment.ledger.payment_count} valid voucher{activeEnrollment.ledger.payment_count === 1 ? '' : 's'}
                          </>
                        )}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-white p-4 border border-[#E4E7E7] shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-medium text-[#6B7272]">Balance Due</span>
                        <div className="mt-1">
                          <BalancePill balance={activeEnrollment.ledger.balance} />
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-[#6B7272] pt-1">
                        {formatAED(activeEnrollment.ledger.balance)}
                      </span>
                    </div>
                  </div>

                  {/* --------------------------------------------------------------- */}
                  {/* 4. ACTIONS BAR                                                  */}
                  {/* --------------------------------------------------------------- */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-[#0A0A0A]">
                        Payment Ledger
                      </h2>
                      <span className="text-xs text-[#6B7272] bg-[#F5F6F6] px-2 py-0.5 rounded-full font-mono">
                        {enrollmentPayments.length} records
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Fee Statement Share Actions (Share PDF, WhatsApp, Email, Download, Print, SMS, Link management) */}
                      <StatementShareActions
                        enrollment={activeEnrollment}
                        student={student}
                        ledger={activeEnrollment.ledger}
                        settings={settings}
                        appUrl={appUrl}
                        isOwner={isOwner}
                      />

                      {/* Desktop Record Payment button */}
                      <Link
                        href={`/receipts/new?enrollment=${activeEnrollment.id}`}
                        className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-[#00A57E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#00805F] transition min-h-[44px]"
                      >
                        <Receipt className="h-4 w-4" />
                        <span>Record Payment</span>
                      </Link>
                    </div>
                  </div>

                  {/* --------------------------------------------------------------- */}
                  {/* 5. LEDGER TABLE                                                 */}
                  {/* --------------------------------------------------------------- */}
                  <div className="rounded-2xl bg-white shadow-sm border border-[#E4E7E7] overflow-hidden">
                    {enrollmentPayments.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#6B7272]">
                        No receipts recorded yet for this enrollment.
                        <div className="mt-3">
                          <Link
                            href={`/receipts/new?enrollment=${activeEnrollment.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#00A57E] hover:underline"
                          >
                            <Receipt className="h-4 w-4" />
                            <span>Record first payment now</span>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F5F6F6]/60 text-[#0A0A0A] font-semibold border-b border-[#E4E7E7]">
                            <tr>
                              <th className="py-3 px-4">Date / Time (Dubai)</th>
                              <th className="py-3 px-4">Receipt No</th>
                              <th className="py-3 px-4">Purpose</th>
                              <th className="py-3 px-4">Mode</th>
                              <th className="py-3 px-4">Received By</th>
                              <th className="hidden md:table-cell py-3 px-4 text-right">VAT Portion</th>
                              <th className="py-3 px-4 text-right">Amount</th>
                              <th className="py-3 px-4 text-right">Balance After</th>
                              <th className="py-3 px-4 text-center">Status</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E4E7E7]">
                            {enrollmentPayments.map((p) => {
                              const isVoid = p.status === 'void'

                              return (
                                <tr
                                  key={p.id}
                                  className={`transition ${isVoid
                                    ? 'bg-red-50/20 text-[#6B7272] line-through'
                                    : 'hover:bg-[#F5F6F6]/40 text-[#0A0A0A]'
                                    }`}
                                >
                                  <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                                    {formatDubaiDateTime(p.paid_at)}
                                  </td>

                                  <td className="py-3.5 px-4 font-mono font-semibold whitespace-nowrap">
                                    <Link
                                      href={`/receipts/${p.id}`}
                                      className="text-[#00A57E] hover:underline"
                                    >
                                      {p.receipt_no}
                                    </Link>
                                  </td>

                                  <td className="py-3.5 px-4 capitalize whitespace-nowrap">
                                    {p.purpose.replace(/_/g, ' ')}
                                    {p.purpose_note && (
                                      <span className="block text-[11px] text-[#6B7272] no-underline">
                                        {p.purpose_note}
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3.5 px-4 capitalize whitespace-nowrap font-medium">
                                    {p.mode.replace(/_/g, ' ')}
                                  </td>

                                  <td className="py-3.5 px-4 whitespace-nowrap">
                                    {p.received_by_profile?.full_name || 'Staff'}
                                  </td>

                                  <td className="hidden md:table-cell py-3.5 px-4 text-right font-mono tabular-nums text-[#6B7272] whitespace-nowrap">
                                    {p.vat_amount != null ? formatAED(p.vat_amount) : '—'}
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                                    {formatAED(p.amount)}
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                    {formatAED(p.balance_after_snapshot)}
                                  </td>

                                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                    {isVoid ? (
                                      <div className="flex flex-col items-center">
                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                          VOID
                                        </span>
                                        {p.void_reason && (
                                          <span className="text-[10px] text-red-600 italic no-underline mt-0.5 max-w-[120px] truncate" title={p.void_reason}>
                                            {p.void_reason}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E6F6F2] text-[#00805F]">
                                        Valid
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                    <Link
                                      href={`/receipts/${p.id}`}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00A57E] hover:underline"
                                    >
                                      <span>View</span>
                                      <ExternalLink className="h-3 w-3" />
                                    </Link>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --------------------------------------------------------------------- */}
          {/* 6. ACTIVITY TIMELINE (Created By & Share Logs)                         */}
          {/* --------------------------------------------------------------------- */}
          <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-[#E4E7E7] space-y-4">
            <h3 className="text-sm font-semibold text-[#0A0A0A] flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#00A57E]" />
              <span>Activity & Distribution History</span>
            </h3>

            <div className="space-y-3 text-xs text-[#6B7272]">
              {/* Creation log */}
              <div className="flex items-start gap-2.5 pb-2 border-b border-[#F5F6F6]">
                <User className="h-4 w-4 text-[#00A57E] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#0A0A0A] font-medium">
                    Candidate enrolled by{' '}
                    <span className="font-semibold text-[#00805F]">
                      {student.creator_profile?.full_name || 'Staff'}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {formatDubaiDateTime(student.created_at)}
                  </p>
                </div>
              </div>

              {/* Audit Logs (Fee changes) */}
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2.5 pb-2 border-b border-[#F5F6F6]"
                >
                  <Shield className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#0A0A0A] font-medium">
                      Fee package adjusted: New Fee AED {log.diff?.new_total_fee} (Discount AED {log.diff?.new_discount})
                    </p>
                    {log.diff?.reason && (
                      <p className="text-amber-800 text-[11px] italic">
                        Reason: &ldquo;{log.diff.reason}&rdquo;
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {formatDubaiDateTime(log.at)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Share logs */}
              {shareLogs.map((share) => (
                <div
                  key={share.id}
                  className="flex items-start gap-2.5 pb-2 border-b border-[#F5F6F6]"
                >
                  <Send className="h-4 w-4 text-[#00A57E] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#0A0A0A]">
                      Receipt voucher distributed via{' '}
                      <span className="font-semibold capitalize text-[#00A57E]">
                        {share.channel}
                      </span>{' '}
                      to <span className="font-mono text-[#0A0A0A]">{share.recipient}</span> by{' '}
                      {share.sent_by_profile?.full_name || 'Staff'}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {formatDubaiDateTime(share.sent_at)}
                    </p>
                  </div>
                </div>
              ))}

              {shareLogs.length === 0 && auditLogs.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No additional distribution or adjustment activity recorded.
                </p>
              )}
            </div>
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* 7. STICKY MOBILE RECORD PAYMENT BAR (≥44px tap target)               */}
          {/* --------------------------------------------------------------------- */}
          {activeEnrollment && (
            <div className="sm:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-sm border-t border-[#E4E7E7] z-30 shadow-lg">
              <Link
                href={`/receipts/new?enrollment=${activeEnrollment.id}`}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#00A57E] px-4 py-3 text-sm font-semibold text-white shadow-md active:bg-[#00805F] min-h-[48px]"
              >
                <Receipt className="h-5 w-5" />
                <span>Record Payment (Balance: {formatAED(activeEnrollment.ledger.balance)})</span>
              </Link>
            </div>
          )}
        </>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALS                                                                */}
      {/* --------------------------------------------------------------------- */}
      <EditStudentModal
        open={editStudentOpen}
        onOpenChange={setEditStudentOpen}
        student={{
          id: student.id,
          full_name: student.full_name,
          mobile: student.mobile,
          whatsapp: student.whatsapp,
          email: student.email,
          notes: student.notes,
        }}
      />

      {activeEnrollment && (
        <EditFeeModal
          open={editFeeOpen}
          onOpenChange={setEditFeeOpen}
          enrollmentId={activeEnrollment.id}
          currentTotalFee={activeEnrollment.ledger.total_fee}
          currentDiscount={activeEnrollment.ledger.discount}
          totalPaid={activeEnrollment.ledger.total_paid}
          paymentCount={activeEnrollment.ledger.payment_count}
          currentVatTreatment={(activeEnrollment.vat_treatment || activeEnrollment.ledger.vat_treatment || 'exclusive') as 'exclusive' | 'inclusive' | 'none'}
          currentVatRate={activeEnrollment.vat_rate ?? activeEnrollment.ledger.vat_rate ?? 5}
          currentNoVatReason={activeEnrollment.no_vat_reason ?? activeEnrollment.ledger.no_vat_reason ?? null}
          vatEnabled={settings?.vat_enabled !== false}
        />
      )}

      <AddEnrollmentModal
        open={addEnrollmentOpen}
        onOpenChange={setAddEnrollmentOpen}
        studentId={student.id}
        universities={universities}
        courses={courses}
        specializations={specializations}
        staffList={staffList}
        currentUserId={currentUserId}
        isOwner={isOwner}
        companySettings={settings}
      />
    </div>
  )
}
