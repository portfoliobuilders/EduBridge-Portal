import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatAED } from '@/lib/money'
import { formatDubaiDateTime } from '@/lib/date'
import { formatPhoneNumber } from '@/lib/phone'
import { PublicStatementActions } from './PublicStatementClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fee Statement | EduBridge Education',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function PublicStatementPage({
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

  // Call get_public_statement RPC
  const { data: statement, error } = await admin.rpc('get_public_statement', {
    p_token: token,
  })

  if (error || !statement) {
    notFound()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = statement as any
  const isVatRegistered = s.company?.vat_enabled !== false
  const treatment = s.vat_treatment || s.vat_type || 'exclusive'
  const isTaxInvoice = isVatRegistered && treatment !== 'none'
  const treatmentLabel = treatment === 'exclusive' ? 'Prices exclusive of VAT' : 'Prices inclusive of VAT'

  return (
    <div className="min-h-screen bg-[#F5F6F6] py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Verification Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white rounded-xl border border-[#E4E7E7] shadow-xs gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-[#00A57E] shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-[#0A0A0A]">
                Official Verified Fee Statement
              </div>
              <div className="text-xs text-muted-foreground">
                Issued by {s.company?.name ?? 'EduBridge Education'} (TRN:{' '}
                {s.company?.trn ?? '105215478600003'})
              </div>
            </div>
          </div>
          <PublicStatementActions token={token} />
        </div>

        {/* Paper Statement Card */}
        <div className="relative bg-white border border-[#E4E7E7] rounded-xl p-8 shadow-md overflow-hidden print:shadow-none print:border-none print:p-0 space-y-6">
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
                {s.company?.name ?? 'EduBridge Education'}
              </div>
              <div>
                {s.company?.address ??
                  'M03, Royal House Building, Hor Al Anz East, Dubai – UAE'}
              </div>
              <div>
                Tel: {formatPhoneNumber(s.company?.phone ?? '+971 58 107 3898')} | Email:{' '}
                {s.company?.email ?? 'info@edubridgeeducation.com'}
              </div>
              <div>Web: {s.company?.website ?? 'https://edubridgeeducation.com'}</div>
              <div className="font-semibold text-[#0A0A0A]">
                TRN: {s.company?.trn ?? '105215478600003'}
              </div>
            </div>
          </div>

          {/* Title Bar */}
          <div className="bg-[#0A0A0A] text-white rounded-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold text-sm tracking-wider uppercase">
                {isTaxInvoice ? 'TAX INVOICE' : 'CANDIDATE FEE STATEMENT'}
              </span>
              {isTaxInvoice && (
                <div className="text-[11px] text-gray-400 font-normal mt-0.5">
                  {treatmentLabel}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                {isTaxInvoice ? 'Invoice Ref: ' : 'Statement Ref: '}
                <span className="font-mono font-semibold text-white">
                  {s.statement_no}
                </span>
              </div>
            </div>
          </div>

          {/* Candidate & Program Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-[#E4E7E7] rounded-lg p-4 space-y-2 text-xs bg-gray-50/50">
              <div className="font-semibold text-sm text-[#0A0A0A] border-b border-gray-200 pb-1 mb-2">
                Candidate Information
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-muted-foreground font-medium">Candidate:</span>
                <span className="font-bold text-[#0A0A0A] col-span-2">
                  {s.student_name}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-muted-foreground font-medium">Candidate ID:</span>
                <span className="font-mono font-semibold col-span-2">
                  {s.student_code}
                </span>
              </div>
              {s.billing_address && (
                <div className="grid grid-cols-3 gap-1 pt-1 border-t border-gray-200">
                  <span className="text-muted-foreground font-medium">Bill To:</span>
                  <span className="col-span-2 text-gray-700">
                    {s.billing_address.contact_name}
                    {s.billing_address.line1 && `, ${s.billing_address.line1}`}
                    {s.billing_address.city && `, ${s.billing_address.city}`}
                  </span>
                </div>
              )}
            </div>

            <div className="border border-[#E4E7E7] rounded-lg p-4 space-y-2 text-xs bg-gray-50/50">
              <div className="font-semibold text-sm text-[#0A0A0A] border-b border-gray-200 pb-1 mb-2">
                Program Information
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-muted-foreground font-medium">University:</span>
                <span className="font-semibold text-[#0A0A0A] col-span-2">
                  {s.university_name}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-muted-foreground font-medium">Course:</span>
                <span className="text-[#0A0A0A] col-span-2">
                  {s.course_name}
                  {s.specialization_name ? ` (${s.specialization_name})` : ''}
                </span>
              </div>
              {s.intake && (
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Intake:</span>
                  <span className="text-gray-700 col-span-2">{s.intake}</span>
                </div>
              )}
            </div>
          </div>

          {/* Account Summary Banner */}
          <div className="border border-[#E4E7E7] rounded-lg p-4 bg-[#F5F6F6] text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-muted-foreground text-[11px] uppercase tracking-wider">
                  Total Fee
                </div>
                <div className="font-mono font-semibold text-sm text-[#0A0A0A] mt-1">
                  {formatAED(Number(s.total_fee))}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px] uppercase tracking-wider">
                  {isTaxInvoice ? 'Total (incl. VAT)' : 'Net Payable'}
                </div>
                <div className="font-mono font-semibold text-sm text-[#0A0A0A] mt-1">
                  {formatAED(Number(s.total_payable))}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px] uppercase tracking-wider">
                  Total Paid
                </div>
                <div className="font-mono font-semibold text-sm text-[#00A57E] mt-1">
                  {formatAED(Number(s.total_paid))}
                </div>
              </div>
              <div className="bg-white p-2 rounded-md border border-[#E4E7E7]">
                <div className="text-xs uppercase tracking-wider font-semibold text-amber-800">
                  Balance Due
                </div>
                <div className="font-mono font-bold text-base text-amber-700 mt-0.5">
                  {formatAED(Number(s.balance))}
                </div>
              </div>
            </div>
          </div>

          {/* Payments Ledger Table */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#00A57E]" />
              <h3 className="font-semibold text-sm text-[#0A0A0A]">
                Payments History
              </h3>
            </div>
            <div className="border border-[#E4E7E7] rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-[#E4E7E7] font-semibold text-[#0A0A0A]">
                  <tr>
                    <th className="py-2.5 px-3">Date (Dubai)</th>
                    <th className="py-2.5 px-3">Receipt No</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3">Purpose</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7E7] font-mono tabular-nums">
                  {s.payments && s.payments.length > 0 ? (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    s.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-3 font-sans">
                          {formatDubaiDateTime(p.paid_at)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#0A0A0A]">
                          {p.receipt_no}
                        </td>
                        <td className="py-2.5 px-3 font-sans capitalize">
                          {p.mode.replace('_', ' ')}
                        </td>
                        <td className="py-2.5 px-3 font-sans capitalize">
                          {p.purpose}
                          {p.purpose_note ? ` (${p.purpose_note})` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#00A57E]">
                          {formatAED(Number(p.amount))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted-foreground font-sans">
                        No payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-[#E4E7E7] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div>
              {s.company?.footer_note ??
                'Keep your receipt vouchers for future references.'}
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-[#0A0A0A]">
                {s.company?.name ?? 'EduBridge Education'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Admissions & Financial Records Department
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
