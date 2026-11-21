import React from 'react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle2, Ban, Printer } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime } from '@/lib/date'
import { amountInWords } from '@/lib/amount-in-words'

export const dynamic = 'force-dynamic'

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Verify UUID format
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)

  if (!isUuid) {
    notFound()
  }

  const admin = createAdminClient()

  // Call get_public_receipt RPC
  const { data: voucher, error } = await admin.rpc('get_public_receipt', {
    p_token: token,
  })

  if (error || !voucher) {
    notFound()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = voucher as any

  // Query company settings for letterhead
  const { data: settings } = await admin
    .from('company_settings')
    .select('*')
    .limit(1)
    .single()

  const isVoid = v.status === 'void'

  return (
    <div className="min-h-screen bg-[#F5F6F6] py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Verification Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white rounded-xl border border-[#E4E7E7] shadow-xs gap-3 print:hidden">
          <div className="flex items-center gap-3">
            {isVoid ? (
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <Ban className="h-5 w-5" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-[#00A57E] shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="font-semibold text-sm text-[#0A0A0A]">
                {isVoid
                  ? 'Voided Receipt Voucher'
                  : 'Official Verified Receipt Voucher'}
              </div>
              <div className="text-xs text-muted-foreground">
                Issued by {settings?.name ?? 'EduBridge Education'} (TRN:{' '}
                {settings?.trn ?? '105215478600003'})
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton />
          </div>
        </div>

        {/* Voucher Paper Card */}
        <div className="relative bg-white border border-[#E4E7E7] rounded-xl p-8 shadow-md overflow-hidden print:shadow-none print:border-none print:p-0">
          {isVoid && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none">
              <span className="text-red-600/15 text-8xl font-black -rotate-30 tracking-widest uppercase">
                VOID
              </span>
            </div>
          )}

          {/* Header */}
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
                {settings?.name ?? 'EduBridge Education'}
              </div>
              <div>
                {settings?.address ??
                  'M03, Royal House Building, Hor Al Anz East, Dubai – UAE'}
              </div>
              <div>
                Tel: {settings?.phone ?? '+971 58 107 3898'} | Email:{' '}
                {settings?.email ?? 'info@edubridgeeducation.com'}
              </div>
              <div>Web: {settings?.website ?? 'https://edubridgeeducation.com'}</div>
              <div className="font-semibold text-[#0A0A0A]">
                TRN: {settings?.trn ?? '105215478600003'}
              </div>
            </div>
          </div>

          {/* Title Bar */}
          <div className="mt-4 mb-4 bg-[#0A0A0A] text-white rounded-md px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-bold text-sm tracking-wider uppercase">
              RECEIPT VOUCHER
            </span>
            <div className="flex items-center gap-4 text-xs">
              <div>
                Receipt No:{' '}
                <span className="font-mono font-semibold text-white">
                  {v.receipt_no}
                </span>
              </div>
              <div>
                Date:{' '}
                <span className="font-semibold text-white">
                  {formatDubaiDateTime(v.paid_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="border border-[#E4E7E7] rounded-lg p-4 space-y-2 text-sm bg-gray-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
                Received From:
              </span>
              <span className="font-bold text-[#0A0A0A] sm:col-span-3">
                {v.payee_name || v.student_name}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
                Student ID:
              </span>
              <span className="font-mono text-xs sm:col-span-3">
                {v.student_code}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
                University:
              </span>
              <span className="text-[#0A0A0A] sm:col-span-3 font-medium">
                {v.university_name}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium text-xs sm:col-span-1">
                Course:
              </span>
              <span className="text-[#0A0A0A] sm:col-span-3">
                {v.course_name}
                {v.specialization_name ? ` (${v.specialization_name})` : ''}
              </span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="mt-4 p-4 rounded-lg bg-[#E6F6F2] border border-[#CCEDE5] flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#00805F]">
                Amount Received
              </div>
              <div className="text-xs italic text-gray-700 mt-1">
                {amountInWords(Number(v.amount))}
              </div>
            </div>
            <div className="text-2xl font-bold text-[#00A57E] font-mono tabular-nums">
              {formatAED(Number(v.amount))}
            </div>
          </div>

          {/* Payment Details */}
          <div className="mt-4 border border-[#E4E7E7] rounded-lg p-4 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium sm:col-span-1">
                Payment Mode:
              </span>
              <span className="font-semibold text-[#0A0A0A] sm:col-span-3">
                {v.mode}
                {v.reference_no && ` (Ref: ${v.reference_no})`}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
              <span className="text-muted-foreground font-medium sm:col-span-1">
                Purpose:
              </span>
              <span className="font-medium text-[#0A0A0A] sm:col-span-3">
                {v.purpose === 'other'
                  ? `Other (${v.purpose_note || ''})`
                  : v.purpose}
              </span>
            </div>
          </div>

          {/* Financial Snapshot */}
          <div className="mt-4 border border-[#E4E7E7] rounded-lg overflow-hidden text-xs">
            <table className="w-full">
              <tbody className="divide-y divide-gray-100 font-mono tabular-nums">
                <tr>
                  <td className="p-2.5 font-sans">Total Payable Fee</td>
                  <td className="p-2.5 text-right font-semibold">
                    {formatAED(Number(v.fee_snapshot))}
                  </td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans">Previously Paid</td>
                  <td className="p-2.5 text-right">
                    {formatAED(Number(v.paid_before_snapshot))}
                  </td>
                </tr>
                <tr className="font-semibold text-foreground">
                  <td className="p-2.5 font-sans">This Payment</td>
                  <td className="p-2.5 text-right text-[#00A57E]">
                    {formatAED(Number(v.amount))}
                  </td>
                </tr>
                <tr className="bg-[#E6F6F2]/60 font-bold text-sm">
                  <td className="p-3 font-sans text-[#00805F]">
                    Balance Remaining
                  </td>
                  <td className="p-3 text-right text-[#00A57E]">
                    {formatAED(Number(v.balance_after_snapshot))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-[#E4E7E7] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div>
              {settings?.footer_note ??
                'Keep your receipt vouchers for future references.'}
            </div>
            <div className="text-right">
              <div className="w-40 border-t border-gray-400 pt-1 text-center">
                <div className="text-xs font-semibold text-[#0A0A0A]">
                  {v.receiver_name ?? 'EduBridge Staff'}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Authorized Signatory
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PrintButton() {
  'use client'
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4 mr-1.5" />
      Print Voucher
    </Button>
  )
}
