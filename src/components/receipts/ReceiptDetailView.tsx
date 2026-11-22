'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  Ban,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime } from '@/lib/date'
import { amountInWords } from '@/lib/amount-in-words'
import { cn } from '@/lib/utils'
import { VoidReceiptDialog } from '@/components/receipts/VoidReceiptDialog'
import { ReceiptShareActions } from '@/components/receipts/ReceiptShareActions'

export interface ReceiptDetailViewProps {
  payment: {
    id: string
    receipt_no: string
    enrollment_id: string
    student_id: string
    amount: number
    mode: string
    purpose: string
    purpose_note: string | null
    reference_no: string | null
    paid_at: string
    received_by: string
    payee_name: string | null
    comments: string | null
    status: string
    fee_snapshot: number
    paid_before_snapshot: number
    balance_after_snapshot: number
    vat_amount: number
    taxable_amount?: number | null
    vat_treatment?: string | null
    vat_type: string
    vat_rate: number
    no_vat_reason?: string | null
    share_token: string
    share_enabled?: boolean
    void_reason?: string | null
    voided_at?: string | null
    voided_by?: string | null
  }
  student: {
    id: string
    full_name: string
    student_code: string
    mobile: string
    whatsapp?: string | null
    email?: string | null
    guardian_name?: string | null
    guardian_email?: string | null
    guardian_phone?: string | null
    guardian_whatsapp?: string | null
  }
  enrollment: {
    id: string
    intake?: string | null
    total_fee: number
    discount: number
    university_name: string
    course_name: string
    specialization_name?: string | null
  }
  settings: {
    name: string
    address: string
    phone: string
    email: string
    website: string
    trn: string
    footer_note: string
    vat_enabled?: boolean | null
    whatsapp_receipt_template?: string | null
  }
  receivedByName: string
  voidedByName?: string | null
  isOwner: boolean
  qrCodeDataUrl: string
  appUrl: string
}

export function ReceiptDetailView({
  payment,
  student,
  enrollment,
  settings,
  receivedByName,
  voidedByName,
  isOwner,
  qrCodeDataUrl,
  appUrl,
}: ReceiptDetailViewProps) {
  const searchParams = useSearchParams()
  const isNew = searchParams?.get('new') === 'true'
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const isVoid = payment.status === 'void'
  const isVatRegistered = settings.vat_enabled !== false
  const treatment = payment.vat_treatment || payment.vat_type || 'exclusive'
  const vatRate = Number(payment.vat_rate ?? 5)
  const vatAmount = Number(payment.vat_amount ?? 0)
  const taxableAmount = payment.taxable_amount != null
    ? Number(payment.taxable_amount)
    : Number(payment.amount) - vatAmount
  const noVatReason = payment.no_vat_reason || 'zero_rated'
  const noVatLabel = noVatReason === 'exempt' ? 'exempt' : noVatReason === 'out_of_scope' ? 'out of scope' : 'zero-rated'

  const modeLabels: Record<string, string> = {
    card: 'Credit / Debit Card',
    cash: 'Cash',
    link: 'Payment Link',
    bank_transfer: 'Bank Transfer',
  }

  const purposeLabels: Record<string, string> = {
    admission: 'Admission Fee',
    repayment: 'Instalment / Re-payment',
    other: payment.purpose_note
      ? `Other (${payment.purpose_note})`
      : 'Other Purpose',
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Action Bar */}
      {isNew && (
        <div className="p-4 bg-[#E6F6F2] border border-[#00A57E] rounded-xl text-[#00805F] flex items-start gap-3 shadow-sm print:hidden">
          <CheckCircle2 className="h-5 w-5 text-[#00A57E] shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm text-[#0A0A0A]">
              Receipt Voucher Issued Successfully!
            </div>
            <div className="text-xs text-[#00805F] mt-0.5">
              Voucher <span className="font-mono font-bold">{payment.receipt_no}</span> is finalized. Use the share actions below to deliver the official PDF voucher to the candidate or guardian.
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#E4E7E7] shadow-xs print:hidden",
        isNew && "ring-2 ring-[#00A57E] ring-offset-2"
      )}>
        <div className="flex items-center gap-3">
          <Link
            href={`/candidates/${student.id}`}
            className="inline-flex items-center justify-center rounded-md border border-[#E4E7E7] bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Candidate
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg text-[#0A0A0A]">
              {payment.receipt_no}
            </span>
            {isVoid ? (
              <Badge variant="destructive" className="font-semibold tracking-wide">
                VOIDED
              </Badge>
            ) : (
              <Badge className="bg-[#00A57E] hover:bg-[#00805F] text-white">
                VALID
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Fee statement PDF */}
          <a
            href={`/api/statements/${enrollment.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-[#E4E7E7] bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground min-h-[44px]"
          >
            <FileText className="h-4 w-4 mr-1.5 text-muted-foreground" />
            <span>Fee Statement</span>
          </a>

          {/* Share, WhatsApp, Email, Download, Print, SMS, Link management */}
          <ReceiptShareActions
            payment={payment}
            student={student}
            settings={settings}
            appUrl={appUrl}
            isOwner={isOwner}
          />

          {/* Owner Void Action */}
          {isOwner && !isVoid && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setVoidDialogOpen(true)}
              className="min-h-[44px] text-xs font-semibold px-3"
            >
              <Ban className="h-4 w-4 mr-1.5" />
              <span>Void Receipt</span>
            </Button>
          )}
        </div>
      </div>

      {/* Void Notice Alert */}
      {isVoid && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-900 flex items-start gap-3">
          <Ban className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">
              This receipt voucher has been VOIDED
            </div>
            <div className="text-xs text-red-700 mt-1">
              Voided on {formatDubaiDateTime(payment.voided_at)}
              {voidedByName ? ` by ${voidedByName}` : ''}
              {payment.void_reason ? ` — Reason: "${payment.void_reason}"` : ''}
            </div>
          </div>
        </div>
      )}

      {/* High-Fidelity Paper Receipt Voucher (A5 Ratio) */}
      <div className="relative bg-white border border-[#E4E7E7] rounded-xl p-8 shadow-md overflow-hidden print:shadow-none print:border-none print:p-0">
        {/* Diagonal VOID Watermark */}
        {isVoid && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none">
            <span className="text-red-600/15 text-8xl font-black -rotate-30 tracking-widest uppercase">
              VOID
            </span>
          </div>
        )}

        {/* 1. Header with Logo & EduBridge Address */}
        <div className="flex flex-col sm:flex-row items-start justify-between pb-4 border-b border-[#E4E7E7] gap-4">
          <div className="relative h-12 w-44">
            <Image
              src="/brand/edubridge-logo-color.svg"
              alt="EduBridge Education"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <div className="font-semibold text-sm text-[#00A57E]">
              {settings.name}
            </div>
            <div>{settings.address}</div>
            <div>
              Tel: {settings.phone} | Email: {settings.email}
            </div>
            <div>Web: {settings.website}</div>
            <div className="font-semibold text-[#0A0A0A]">TRN: {settings.trn}</div>
          </div>
        </div>

        {/* 2. Black Title Bar */}
        <div className="mt-4 mb-4 bg-[#0A0A0A] text-white rounded-md px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="font-bold text-sm tracking-wider uppercase">
            RECEIPT VOUCHER
          </span>
          <div className="flex items-center gap-4 text-xs">
            <div>
              Receipt No:{' '}
              <span className="font-mono font-semibold text-white">
                {payment.receipt_no}
              </span>
            </div>
            <div>
              Date:{' '}
              <span className="font-semibold text-white">
                {formatDubaiDateTime(payment.paid_at)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Received From & Enrollment Details */}
        <div className="border border-[#E4E7E7] rounded-lg p-4 space-y-2 text-sm bg-gray-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
            <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
              Received From:
            </span>
            <span className="font-bold text-[#0A0A0A] sm:col-span-3">
              {payment.payee_name || student.full_name}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
            <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
              Candidate ID / Mobile:
            </span>
            <span className="font-mono text-xs sm:col-span-3">
              {student.student_code} · {student.mobile}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
            <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
              University:
            </span>
            <span className="text-[#0A0A0A] sm:col-span-3 font-medium">
              {enrollment.university_name}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
            <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
              Course / Intake:
            </span>
            <span className="text-[#0A0A0A] sm:col-span-3">
              {enrollment.course_name}
              {enrollment.specialization_name
                ? ` (${enrollment.specialization_name})`
                : ''}
              {enrollment.intake ? ` · Intake: ${enrollment.intake}` : ''}
            </span>
          </div>
        </div>

        {/* 4. Highlighted Amount Box */}
        <div className="mt-4 p-4 rounded-lg bg-[#E6F6F2] border border-[#CCEDE5] space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#00805F]">
                {isVatRegistered && treatment !== 'none'
                  ? `Amount received (incl. VAT ${vatRate}%)`
                  : 'Amount Received'}
              </div>
              <div className="text-xs italic text-gray-700 mt-1">
                {amountInWords(payment.amount)}
              </div>
            </div>
            <div className="text-2xl font-bold text-[#00A57E] font-mono tabular-nums">
              {formatAED(payment.amount)}
            </div>
          </div>

          {isVatRegistered && treatment !== 'none' && (
            <div className="pt-2 border-t border-[#CCEDE5] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#00805F] font-semibold font-mono">
                of which VAT: {formatAED(vatAmount)}
              </span>
              <span className="text-gray-600 font-mono">
                Taxable: {formatAED(taxableAmount)}
              </span>
            </div>
          )}

          {isVatRegistered && treatment === 'none' && (
            <div className="pt-2 border-t border-[#CCEDE5] text-xs text-gray-600">
              VAT: Not applicable ({noVatLabel})
            </div>
          )}
        </div>

        {/* 5. Payment Transaction Details */}
        <div className="mt-4 border border-[#E4E7E7] rounded-lg p-4 space-y-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
            <span className="text-muted-foreground font-medium sm:col-span-1">
              Payment Mode:
            </span>
            <span className="font-semibold text-[#0A0A0A] sm:col-span-3">
              {modeLabels[payment.mode] || payment.mode}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
            <span className="text-muted-foreground font-medium sm:col-span-1">
              Purpose:
            </span>
            <span className="font-medium text-[#0A0A0A] sm:col-span-3">
              {purposeLabels[payment.purpose] || payment.purpose}
            </span>
          </div>
          {payment.comments && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium sm:col-span-1">
                Comments:
              </span>
              <span className="text-muted-foreground sm:col-span-3">
                {payment.comments}
              </span>
            </div>
          )}
        </div>

        {/* 6. Financial Ledger Snapshot */}
        <div className="mt-4 border border-[#E4E7E7] rounded-lg overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-[#F5F6F6] border-b border-[#E4E7E7] text-left text-muted-foreground font-medium">
              <tr>
                <th className="p-2.5">Description</th>
                <th className="p-2.5 text-right">Amount (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono tabular-nums">
              <tr>
                <td className="p-2.5 font-sans">Total Course Tuition</td>
                <td className="p-2.5 text-right">{formatAED(enrollment.total_fee)}</td>
              </tr>
              {enrollment.discount > 0 && (
                <tr>
                  <td className="p-2.5 font-sans">Less Discount</td>
                  <td className="p-2.5 text-right text-destructive">
                    - {formatAED(enrollment.discount)}
                  </td>
                </tr>
              )}
              {isVatRegistered && treatment === 'exclusive' && (
                <>
                  <tr>
                    <td className="p-2.5 font-sans">Net Tuition (excl. VAT)</td>
                    <td className="p-2.5 text-right">
                      {formatAED(enrollment.total_fee - enrollment.discount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-sans">
                      VAT ({vatRate}%) on Tuition
                    </td>
                    <td className="p-2.5 text-right">
                      {formatAED(
                        payment.fee_snapshot -
                        (enrollment.total_fee - enrollment.discount)
                      )}
                    </td>
                  </tr>
                </>
              )}
              {isVatRegistered && treatment === 'inclusive' && (
                <tr>
                  <td className="p-2.5 font-sans">
                    VAT ({vatRate}% included in payment)
                  </td>
                  <td className="p-2.5 text-right">{formatAED(vatAmount)}</td>
                </tr>
              )}
              <tr className="bg-gray-50/70 font-semibold">
                <td className="p-2.5 font-sans">Total Payable</td>
                <td className="p-2.5 text-right">{formatAED(payment.fee_snapshot)}</td>
              </tr>
              <tr>
                <td className="p-2.5 font-sans">Previously Paid</td>
                <td className="p-2.5 text-right">
                  {formatAED(payment.paid_before_snapshot)}
                </td>
              </tr>
              <tr className="font-semibold text-foreground">
                <td className="p-2.5 font-sans">This Payment</td>
                <td className="p-2.5 text-right text-[#00A57E]">
                  {formatAED(payment.amount)}
                </td>
              </tr>
              <tr className="bg-[#E6F6F2]/60 font-bold text-sm">
                <td className="p-3 font-sans text-[#00805F]">Balance Remaining</td>
                <td className="p-3 text-right text-[#00A57E]">
                  {formatAED(payment.balance_after_snapshot)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 7. Footer with QR Code & Authorized Signatory */}
        <div className="mt-8 pt-4 border-t border-[#E4E7E7] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 border border-gray-200 rounded p-1 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeDataUrl}
                alt="QR Code"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground max-w-xs font-medium">
                {settings.footer_note}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Scan QR code to verify receipt authenticity online
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="w-40 border-t border-gray-400 pt-1 text-center">
              <div className="text-xs font-semibold text-[#0A0A0A]">
                {receivedByName}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Authorized Signatory
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Void Dialog */}
      {isOwner && (
        <VoidReceiptDialog
          paymentId={payment.id}
          receiptNo={payment.receipt_no}
          amount={payment.amount}
          open={voidDialogOpen}
          onOpenChange={setVoidDialogOpen}
        />
      )}
    </div>
  )
}
