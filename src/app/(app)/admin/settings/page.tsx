import React from 'react'
import type { Metadata } from 'next'
import { requireOwner } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Company Settings',
}
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/PageHeader'
import { AdminNav } from '@/components/admin/AdminNav'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { SettingsClient, type CompanySettingsData } from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireOwner()
  const supabase = await createClient()

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('singleton', true)
    .single()

  const initialSettings: CompanySettingsData = {
    name: settings?.name ?? 'EduBridge Education',
    address: settings?.address ?? 'M03, Royal House Building, Hor Al Anz East, Dubai – UAE',
    phone: settings?.phone ?? '+971 58 107 3898',
    email: settings?.email ?? 'info@edubridgeeducation.com',
    website: settings?.website ?? 'https://edubridgeeducation.com',
    trn: settings?.trn ?? '105215478600003',
    logo_path: settings?.logo_path ?? null,
    receipt_prefix: settings?.receipt_prefix ?? 'EB-RV',
    statement_prefix: settings?.statement_prefix ?? 'EB-FS',
    vat_enabled: settings?.vat_enabled ?? false,
    vat_rate: Number(settings?.vat_rate ?? 5.0),
    default_vat_treatment: (settings?.default_vat_treatment as 'exclusive' | 'inclusive' | 'none') ?? 'exclusive',
    no_vat_reason: (settings?.no_vat_reason as 'zero_rated' | 'exempt' | 'out_of_scope') ?? 'zero_rated',
    footer_note: settings?.footer_note ?? 'Keep your receipt vouchers for future references.',
    terms: settings?.terms ?? null,
    whatsapp_receipt_template:
      settings?.whatsapp_receipt_template ??
      'Dear {student_name}, thank you for your payment of AED {amount} to EduBridge Education. Receipt No: {receipt_no}. Balance: AED {balance}. View/download: {public_link}',
    whatsapp_statement_template:
      settings?.whatsapp_statement_template ??
      'Dear {student_name}, your balance due with EduBridge Education is AED {balance}. Statement: {public_link}',
    email_subject_template:
      settings?.email_subject_template ??
      'Payment Receipt {receipt_no} - EduBridge Education',
    email_body_template:
      settings?.email_body_template ??
      'Dear {student_name},\n\nThank you for your payment of AED {amount} to EduBridge Education.\n\nReceipt No: {receipt_no}\nBalance: AED {balance}\nView or download your official receipt voucher here: {public_link}\n\nKeep your receipt vouchers for future references.\n\nEduBridge Education\nDubai, UAE',
    admins_can_void: settings?.admins_can_void ?? false,
    support_access_enabled: settings?.support_access_enabled ?? false,
    celebrations_enabled: settings?.celebrations_enabled ?? false,
    celebration_emails_enabled: settings?.celebration_emails_enabled ?? true,
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Company Settings' },
        ]}
      />

      <PageHeader
        title="Company Settings"
        subtitle="Manage business identity, letterhead branding, numbering prefixes, VAT rate, and messaging templates"
      />

      <AdminNav />

      <SettingsClient initialSettings={initialSettings} />
    </div>
  )
}
