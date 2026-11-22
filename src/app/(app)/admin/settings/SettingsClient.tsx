'use client'

import React, { useState, useTransition, useRef } from 'react'
import {
  Building2,
  Image as ImageIcon,
  Receipt,
  MessageSquare,
  AlertTriangle,
  Upload,
  Eye,
  Sparkles,
  Info,
  ShieldCheck,
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { updateCompanySettingsAction, uploadLogoAction } from './actions'
import { toast } from 'sonner'

export interface CompanySettingsData {
  name: string
  address: string
  phone: string
  email: string
  website: string
  trn: string
  logo_path: string | null
  receipt_prefix: string
  statement_prefix: string
  vat_enabled: boolean
  vat_rate: number
  default_vat_treatment: 'exclusive' | 'inclusive' | 'none'
  no_vat_reason: 'zero_rated' | 'exempt' | 'out_of_scope'
  footer_note: string | null
  terms: string | null
  whatsapp_receipt_template: string
  whatsapp_statement_template: string
  email_subject_template: string
  email_body_template: string
  whatsapp_doc_request_template?: string | null
  email_doc_request_template?: string | null
  admins_can_void?: boolean
  support_access_enabled?: boolean
}

const TEMPLATE_VARIABLES = [
  { tag: '{student_name}', desc: 'Candidate full name' },
  { tag: '{amount}', desc: 'Payment amount (e.g. 12,500.00)' },
  { tag: '{receipt_no}', desc: 'Receipt number (e.g. EB-RV-2026-0001)' },
  { tag: '{balance}', desc: 'Remaining balance (e.g. 37,500.00)' },
  { tag: '{public_link}', desc: 'Public link to view receipt / statement' },
  { tag: '{upload_link}', desc: 'Self-upload link for candidate documents' },
  { tag: '{expiry}', desc: 'Document request link validity/expiry duration' },
  { tag: '{company_name}', desc: 'Company / business name' },
]

export function SettingsClient({
  initialSettings,
}: {
  initialSettings: CompanySettingsData
}) {
  const [settings, setSettings] = useState<CompanySettingsData>(initialSettings)
  const [activeTab, setActiveTab] = useState<'general' | 'branding' | 'billing' | 'templates' | 'security'>('general')

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoTimestamp, setLogoTimestamp] = useState(0)

  // Form saving state
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  // Message preview active template
  const [previewTemplateType, setPreviewTemplateType] = useState<
    'whatsapp_receipt' | 'whatsapp_statement' | 'whatsapp_doc_request' | 'email' | 'email_doc_request'
  >('whatsapp_receipt')

  const handleInputChange = (field: keyof CompanySettingsData, value: string | boolean | number | null) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 1024 * 1024) {
      toast.error('File size exceeds 1 MB limit')
      return
    }

    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      toast.error('Only PNG and SVG files are allowed')
      return
    }

    setLogoUploading(true)
    const formData = new FormData()
    formData.append('logo', file)

    const res = await uploadLogoAction(formData)
    setLogoUploading(false)

    if (res.success && res.data) {
      setSettings((prev) => ({ ...prev, logo_path: res.data!.logoPath }))
      setLogoTimestamp(Date.now())
      toast.success('Logo uploaded and applied successfully')
    } else {
      toast.error(res.error ?? 'Failed to upload logo')
    }
  }

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.append('name', settings.name)
      formData.append('address', settings.address)
      formData.append('phone', settings.phone)
      formData.append('email', settings.email)
      formData.append('website', settings.website)
      formData.append('trn', settings.trn)
      formData.append('receipt_prefix', settings.receipt_prefix)
      formData.append('statement_prefix', settings.statement_prefix)
      formData.append('vat_enabled', String(settings.vat_enabled))
      formData.append('vat_rate', String(settings.vat_rate))
      formData.append('default_vat_treatment', settings.default_vat_treatment || 'exclusive')
      formData.append('no_vat_reason', settings.no_vat_reason || 'zero_rated')
      if (settings.footer_note) formData.append('footer_note', settings.footer_note)
      if (settings.terms) formData.append('terms', settings.terms)
      formData.append('whatsapp_receipt_template', settings.whatsapp_receipt_template)
      formData.append('whatsapp_statement_template', settings.whatsapp_statement_template)
      formData.append('email_subject_template', settings.email_subject_template)
      formData.append('email_body_template', settings.email_body_template)
      if (settings.whatsapp_doc_request_template) {
        formData.append('whatsapp_doc_request_template', settings.whatsapp_doc_request_template)
      }
      if (settings.email_doc_request_template) {
        formData.append('email_doc_request_template', settings.email_doc_request_template)
      }
      formData.append('admins_can_void', String(Boolean(settings.admins_can_void)))
      formData.append('support_access_enabled', String(Boolean(settings.support_access_enabled)))

      const res = await updateCompanySettingsAction(formData)
      if (res.success) {
        toast.success('Company settings saved successfully')
      } else {
        setFormError(res.error ?? 'Failed to update settings')
        toast.error(res.error ?? 'Failed to update settings')
      }
    })
  }

  // Template preview interpolator
  const renderSamplePreview = (template: string) => {
    return template
      .replace(/\{student_name\}/g, 'Sarah Al Mansoori')
      .replace(/\{amount\}/g, '15,000.00')
      .replace(/\{receipt_no\}/g, `${settings.receipt_prefix}-2026-0042`)
      .replace(/\{balance\}/g, '45,000.00')
      .replace(/\{public_link\}/g, 'https://edubridgeeducation.com/r/a1b2c3d4')
      .replace(/\{upload_link\}/g, 'https://edubridgeeducation.com/u/doc_token_123')
      .replace(/\{expiry\}/g, '7 days')
      .replace(/\{company_name\}/g, settings.name || 'EduBridge Education')
  }

  return (
    <form onSubmit={handleSaveSettings} className="space-y-6">
      {/* Sub tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-white p-1.5 rounded-2xl border border-border scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${activeTab === 'general'
            ? 'bg-primary text-white shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
            }`}
        >
          <Building2 className="w-4 h-4" />
          General & Contact
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${activeTab === 'branding'
            ? 'bg-primary text-white shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
            }`}
        >
          <ImageIcon className="w-4 h-4" />
          Logo & Header
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${activeTab === 'billing'
            ? 'bg-primary text-white shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
            }`}
        >
          <Receipt className="w-4 h-4" />
          Prefixes & VAT
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${activeTab === 'templates'
            ? 'bg-primary text-white shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
            }`}
        >
          <MessageSquare className="w-4 h-4" />
          Message Templates
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${activeTab === 'security'
            ? 'bg-primary text-white shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
            }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Security & Access
        </button>
      </div>

      {formError && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-center gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{formError}</span>
        </div>
      )}

      {/* 1. General & Contact */}
      {activeTab === 'general' && (
        <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">Business Identity</h3>
            <p className="text-xs text-muted-foreground">
              Official legal name, registered address, and UAE Tax Registration Number (TRN).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">
                Company Legal Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={settings.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">
                Official Address <span className="text-destructive">*</span>
              </Label>
              <Input
                value={settings.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Official Phone Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={settings.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Official Email <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={settings.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Website URL <span className="text-destructive">*</span>
              </Label>
              <Input
                type="url"
                value={settings.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Tax Registration Number (TRN) <span className="text-destructive">*</span>
              </Label>
              <Input
                value={settings.trn}
                onChange={(e) => handleInputChange('trn', e.target.value)}
                className="h-10 rounded-xl font-mono"
                required
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Logo & Live Receipt Header Preview */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Official Letterhead Logo</h3>
              <p className="text-xs text-muted-foreground">
                Upload your official company logo. Accepted formats: PNG or SVG. Max size: 1 MB.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-neutral-50 border border-border">
              <div className="w-48 h-20 bg-white rounded-xl border border-border flex items-center justify-center p-3 relative overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/branding/logo?t=${logoTimestamp}`}
                  alt="Company Logo"
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={logoUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl h-10 gap-2 text-xs font-semibold"
                >
                  <Upload className="w-4 h-4 text-primary" />
                  {logoUploading ? 'Uploading...' : 'Upload New Logo'}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Stored securely in private branding storage bucket. Fallback: standard EduBridge wordmark.
                </p>
              </div>
            </div>
          </div>

          {/* Live Receipt Header Preview */}
          <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">
                    Live Receipt-Header Preview
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is how your official header renders on receipts, invoices, and PDF vouchers.
                </p>
              </div>
              <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/30">
                Live Preview
              </Badge>
            </div>

            {/* Rendered Header Mockup */}
            <div className="bg-[#FAFBFB] p-6 rounded-2xl border-2 border-border/80">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pb-4 border-b border-border/80">
                <div className="space-y-2">
                  <div className="h-10 flex items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/branding/logo?t=${logoTimestamp}`}
                      alt="Company Logo"
                      className="max-h-10 w-auto object-contain"
                    />
                  </div>
                  <p className="text-xs font-semibold text-foreground font-display">
                    {settings.name || 'EduBridge Education'}
                  </p>
                </div>

                <div className="text-left sm:text-right text-xs text-muted-foreground space-y-1">
                  <p className="text-foreground font-medium">{settings.address}</p>
                  <p>
                    Tel: <span className="text-foreground">{settings.phone}</span> • Email:{' '}
                    <span className="text-foreground">{settings.email}</span>
                  </p>
                  <p>
                    Web: <span className="text-primary">{settings.website}</span> • TRN:{' '}
                    <span className="font-mono text-foreground font-medium">{settings.trn}</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-mono">
                  Sample Voucher: <strong className="text-foreground">{settings.receipt_prefix}-2026-0001</strong>
                </span>
                <span>Dubai, UAE</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Prefixes & VAT */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Numbering Prefixes</h3>
              <p className="text-xs text-muted-foreground">
                Configure voucher sequence prefixes for payment receipts and fee statements.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Warning:</strong> Changing receipt prefix only affects new receipts; existing
                receipt numbers and audit snapshots never change.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Receipt Voucher Prefix <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={settings.receipt_prefix}
                  onChange={(e) => handleInputChange('receipt_prefix', e.target.value.toUpperCase())}
                  className="h-10 rounded-xl font-mono uppercase"
                  placeholder="EB-RV"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Example generated: <code className="font-mono text-foreground">{settings.receipt_prefix}-2026-0001</code>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Fee Statement Prefix <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={settings.statement_prefix}
                  onChange={(e) => handleInputChange('statement_prefix', e.target.value.toUpperCase())}
                  className="h-10 rounded-xl font-mono uppercase"
                  placeholder="EB-FS"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Example generated: <code className="font-mono text-foreground">{settings.statement_prefix}-2026-0001</code>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">VAT Configuration</h3>
              <p className="text-xs text-muted-foreground">
                Control whether VAT is charged on receipts and set the statutory tax rate.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Important:</strong> Confirm VAT treatment with your accountant before enabling.
                Education services may have specific zero-rated or exempt conditions under UAE VAT law.
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-50 border border-border">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Enable VAT on Receipts</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, tax is automatically calculated and shown on receipt vouchers.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.vat_enabled}
                onClick={() => handleInputChange('vat_enabled', !settings.vat_enabled)}
                className={`w-12 h-6 rounded-full transition-colors relative focus:outline-hidden ${settings.vat_enabled ? 'bg-primary' : 'bg-neutral-300'
                  }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform ${settings.vat_enabled ? 'translate-x-6.5' : 'translate-x-0.5'
                    }`}
                />
              </button>
            </div>

            {settings.vat_enabled ? (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      VAT Rate (%) <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={settings.vat_rate}
                        onChange={(e) => handleInputChange('vat_rate', e.target.value)}
                        className="h-10 rounded-xl font-mono"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Default VAT Treatment</Label>
                    <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                      <button
                        type="button"
                        onClick={() => handleInputChange('default_vat_treatment', 'exclusive')}
                        className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${settings.default_vat_treatment === 'exclusive'
                          ? 'bg-white text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        + VAT on top
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInputChange('default_vat_treatment', 'inclusive')}
                        className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${settings.default_vat_treatment === 'inclusive'
                          ? 'bg-white text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        Includes VAT
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInputChange('default_vat_treatment', 'none')}
                        className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${settings.default_vat_treatment === 'none'
                          ? 'bg-white text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        No VAT
                      </button>
                    </div>
                  </div>
                </div>

                {settings.default_vat_treatment === 'none' && (
                  <div className="space-y-1.5 max-w-sm">
                    <Label className="text-xs font-semibold">Default No-VAT Reason</Label>
                    <select
                      value={settings.no_vat_reason}
                      onChange={(e) => handleInputChange('no_vat_reason', e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-white border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="zero_rated">Zero-rated (0%)</option>
                      <option value="exempt">Exempt</option>
                      <option value="out_of_scope">Out of scope</option>
                    </select>
                  </div>
                )}

                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-muted-foreground">
                  <strong>Note:</strong> Changing settings never changes existing enrollments — historical enrollments retain their stored VAT treatment and rate snapshot.
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>VAT is currently disabled:</strong> VAT treatment is automatically set to &ldquo;No VAT&rdquo; for all new enrollments, and VAT options are hidden on fee forms.
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  Existing historical enrollments retain their original stored VAT treatment and rate.
                </p>
              </div>
            )}

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Voucher Footer Note</Label>
                <Input
                  value={settings.footer_note || ''}
                  onChange={(e) => handleInputChange('footer_note', e.target.value)}
                  className="h-10 rounded-xl"
                  placeholder="Keep your receipt vouchers for future references."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Terms & Conditions</Label>
                <Textarea
                  value={settings.terms || ''}
                  onChange={(e) => handleInputChange('terms', e.target.value)}
                  className="rounded-xl min-h-[90px] text-xs"
                  placeholder="Standard payment terms, instalment schedules, and refund policies..."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Message Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Message Templates</h3>
              <p className="text-xs text-muted-foreground">
                Configure standardized messages sent via WhatsApp and Email when sharing vouchers.
              </p>
            </div>

            {/* Allowed variables chips */}
            <div className="p-3.5 bg-neutral-50 border border-border rounded-xl space-y-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Allowed Dynamic Variables
              </span>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Badge
                    key={v.tag}
                    variant="outline"
                    className="bg-white border-border text-foreground font-mono text-[11px] py-1 px-2.5"
                    title={v.desc}
                  >
                    {v.tag}{' '}
                    <span className="text-muted-foreground font-normal ml-1">({v.desc})</span>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  WhatsApp Receipt Template <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={settings.whatsapp_receipt_template}
                  onChange={(e) => handleInputChange('whatsapp_receipt_template', e.target.value)}
                  className="rounded-xl text-xs min-h-[75px]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  WhatsApp Fee Statement Template <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={settings.whatsapp_statement_template}
                  onChange={(e) =>
                    handleInputChange('whatsapp_statement_template', e.target.value)
                  }
                  className="rounded-xl text-xs min-h-[75px]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Email Subject Template <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={settings.email_subject_template}
                  onChange={(e) => handleInputChange('email_subject_template', e.target.value)}
                  className="h-10 rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Email Body Template <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={settings.email_body_template}
                  onChange={(e) => handleInputChange('email_body_template', e.target.value)}
                  className="rounded-xl text-xs min-h-[140px]"
                  required
                />
              </div>

              <div className="pt-4 border-t border-border space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Document Request Templates</h4>
                  <p className="text-xs text-muted-foreground">
                    Custom messages sent to candidates when requesting documents via secure link.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    WhatsApp Document Request Template
                  </Label>
                  <Textarea
                    value={settings.whatsapp_doc_request_template || ''}
                    onChange={(e) =>
                      handleInputChange('whatsapp_doc_request_template', e.target.value)
                    }
                    placeholder="Dear {student_name}, please upload your documents using this link: {upload_link} (link valid for {expiry}). - {company_name}"
                    className="rounded-xl text-xs min-h-[75px]"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to use the standard default request template.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Email Document Request Template
                  </Label>
                  <Textarea
                    value={settings.email_doc_request_template || ''}
                    onChange={(e) =>
                      handleInputChange('email_doc_request_template', e.target.value)
                    }
                    placeholder="Dear {student_name}, please upload your requested documents securely here: {upload_link}. This link will expire in {expiry}. Best regards, {company_name}"
                    className="rounded-xl text-xs min-h-[100px]"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to use the standard default request template.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Live Message Preview */}
          <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  Live Message Preview
                </h3>
                <p className="text-xs text-muted-foreground">
                  Simulated message with actual sample values substituted into variables.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-neutral-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTemplateType('whatsapp_receipt')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${previewTemplateType === 'whatsapp_receipt'
                    ? 'bg-white text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  WA Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTemplateType('whatsapp_statement')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${previewTemplateType === 'whatsapp_statement'
                    ? 'bg-white text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  WA Statement
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTemplateType('whatsapp_doc_request')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${previewTemplateType === 'whatsapp_doc_request'
                    ? 'bg-white text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  WA Doc Request
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTemplateType('email')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${previewTemplateType === 'email'
                    ? 'bg-white text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Email Voucher
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTemplateType('email_doc_request')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${previewTemplateType === 'email_doc_request'
                    ? 'bg-white text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Email Doc Request
                </button>
              </div>
            </div>

            <div className="bg-neutral-50 p-5 rounded-2xl border border-border">
              {previewTemplateType === 'email' ? (
                <div className="space-y-3">
                  <div className="pb-2 border-b border-border/80 text-xs">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-semibold text-foreground">
                      {renderSamplePreview(settings.email_subject_template)}
                    </span>
                  </div>
                  <pre className="font-sans text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {renderSamplePreview(settings.email_body_template)}
                  </pre>
                </div>
              ) : previewTemplateType === 'email_doc_request' ? (
                <div className="space-y-3">
                  <div className="pb-2 border-b border-border/80 text-xs">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-semibold text-foreground">
                      Document Upload Request — Sarah Al Mansoori
                    </span>
                  </div>
                  <pre className="font-sans text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {renderSamplePreview(
                      settings.email_doc_request_template ||
                      'Dear {student_name},\n\nPlease upload the required documents for your admission using this secure link:\n{upload_link}\n\nThis link is valid for {expiry}.\n\nBest regards,\n{company_name}'
                    )}
                  </pre>
                </div>
              ) : (
                <div className="bg-[#E6F6F2] p-4 rounded-xl border border-primary/20 max-w-md">
                  <p className="text-xs text-neutral-900 whitespace-pre-wrap leading-relaxed">
                    {renderSamplePreview(
                      previewTemplateType === 'whatsapp_receipt'
                        ? settings.whatsapp_receipt_template
                        : previewTemplateType === 'whatsapp_statement'
                          ? settings.whatsapp_statement_template
                          : settings.whatsapp_doc_request_template ||
                          'Dear {student_name}, please upload your admission documents using this secure upload link: {upload_link}\n(Note: This link will expire in {expiry}). Thank you!'
                    )}
                  </p>
                  <span className="text-[10px] text-neutral-500 float-right mt-1">10:45 AM ✓✓</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Security & Access */}
      {activeTab === 'security' && (
        <div className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Role Permissions & Emergency Access</h3>
            <p className="text-xs text-muted-foreground">
              Configure fine-grained privileges for Admins and manage emergency developer support access.
            </p>
          </div>

          <div className="space-y-4">
            {/* Admins can void receipts switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-[#F5F6F6] gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Allow Admins to Void Receipts
                </span>
                <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                  When enabled, staff with the Admin role can void receipt vouchers with a mandatory reason.
                  When disabled, only Super Admins can void receipts. Staff counsellors can never void receipts.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.admins_can_void)}
                onClick={() => handleInputChange('admins_can_void', !settings.admins_can_void)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${settings.admins_can_void ? 'bg-primary' : 'bg-neutral-300'
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${settings.admins_can_void ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {/* Emergency Support Access switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-[#F5F6F6] gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  Emergency Support Access
                </span>
                <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                  Allow temporary technical support accounts (<code className="text-[11px] font-mono bg-white px-1 py-0.5 rounded border">is_support = true</code>) to log in and assist with system troubleshooting.
                  When disabled, all support accounts are immediately locked out at the database policy level.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.support_access_enabled)}
                onClick={() => handleInputChange('support_access_enabled', !settings.support_access_enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${settings.support_access_enabled ? 'bg-primary' : 'bg-neutral-300'
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${settings.support_access_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {settings.support_access_enabled && (
              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Support access is currently active.</strong> Remember to toggle this off once support or maintenance is completed.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="submit"
          disabled={isPending}
          className="rounded-xl px-6 h-11 font-semibold text-sm"
        >
          {isPending ? 'Saving Settings...' : 'Save Company Settings'}
        </Button>
      </div>
    </form>
  )
}
