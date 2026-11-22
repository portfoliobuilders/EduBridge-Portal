'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { z } from 'zod'

const companySettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Company name is required'),
    address: z.string().trim().min(1, 'Address is required'),
    phone: z.string().trim().min(1, 'Phone is required'),
    email: z.string().trim().email('Invalid email address'),
    website: z.string().trim().url('Invalid website URL'),
    trn: z.string().trim(),
    receipt_prefix: z.string().trim().min(1, 'Receipt prefix is required'),
    statement_prefix: z.string().trim().min(1, 'Statement prefix is required'),
    vat_enabled: z.boolean(),
    vat_rate: z
      .string()
      .trim()
      .refine(
        (val) => /^\d+(\.\d{1,2})?$/.test(val) && Number(val) >= 0 && Number(val) <= 100,
        'VAT rate must be between 0.00 and 100.00 with up to 2 decimal places'
      ),
    default_vat_treatment: z.enum(['exclusive', 'inclusive', 'none']).default('exclusive'),
    no_vat_reason: z.enum(['zero_rated', 'exempt', 'out_of_scope']).default('zero_rated'),
    footer_note: z.string().trim().optional().nullable(),
    terms: z.string().trim().optional().nullable(),
    whatsapp_receipt_template: z.string().trim().min(1, 'WhatsApp receipt template is required'),
    whatsapp_statement_template: z.string().trim().min(1, 'WhatsApp statement template is required'),
    email_subject_template: z.string().trim().min(1, 'Email subject template is required'),
    email_body_template: z.string().trim().min(1, 'Email body template is required'),
    whatsapp_doc_request_template: z.string().trim().optional().nullable(),
    email_doc_request_template: z.string().trim().optional().nullable(),
    admins_can_void: z.boolean().default(false),
    support_access_enabled: z.boolean().default(false),
    celebration_emails_enabled: z.boolean().default(true),
    show_aed_to_staff: z.boolean().default(false),
    monthly_top_performer_notification: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.vat_enabled && (!data.trn || data.trn.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trn'],
        message: 'Tax Registration Number (TRN) is required when VAT registered',
      })
    }
  })

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function updateCompanySettingsAction(formData: FormData): Promise<ActionResult> {
  const { user } = await requireOwner()
  const supabase = await createClient()

  const raw = {
    name: String(formData.get('name') ?? ''),
    address: String(formData.get('address') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    website: String(formData.get('website') ?? ''),
    trn: String(formData.get('trn') ?? ''),
    receipt_prefix: String(formData.get('receipt_prefix') ?? 'EB-RV'),
    statement_prefix: String(formData.get('statement_prefix') ?? 'EB-FS'),
    vat_enabled: formData.get('vat_enabled') === 'true',
    vat_rate: String(formData.get('vat_rate') ?? '5.00'),
    default_vat_treatment: String(formData.get('default_vat_treatment') ?? 'exclusive'),
    no_vat_reason: String(formData.get('no_vat_reason') ?? 'zero_rated'),
    footer_note: formData.get('footer_note') ? String(formData.get('footer_note')) : null,
    terms: formData.get('terms') ? String(formData.get('terms')) : null,
    whatsapp_receipt_template: String(formData.get('whatsapp_receipt_template') ?? ''),
    whatsapp_statement_template: String(formData.get('whatsapp_statement_template') ?? ''),
    email_subject_template: String(formData.get('email_subject_template') ?? ''),
    email_body_template: String(formData.get('email_body_template') ?? ''),
    whatsapp_doc_request_template: formData.get('whatsapp_doc_request_template')
      ? String(formData.get('whatsapp_doc_request_template'))
      : null,
    email_doc_request_template: formData.get('email_doc_request_template')
      ? String(formData.get('email_doc_request_template'))
      : null,
    admins_can_void: formData.get('admins_can_void') === 'true',
    support_access_enabled: formData.get('support_access_enabled') === 'true',
    celebration_emails_enabled: formData.get('celebration_emails_enabled') !== 'false',
    show_aed_to_staff: formData.get('show_aed_to_staff') === 'true',
    monthly_top_performer_notification: formData.get('monthly_top_performer_notification') === 'true',
  }

  const parsed = companySettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const data = parsed.data

  const { error } = await supabase
    .from('company_settings')
    .update({
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      trn: data.trn,
      receipt_prefix: data.receipt_prefix,
      statement_prefix: data.statement_prefix,
      vat_enabled: data.vat_enabled,
      vat_rate: Number(data.vat_rate),
      default_vat_treatment: data.default_vat_treatment,
      no_vat_reason: data.no_vat_reason,
      footer_note: data.footer_note || null,
      terms: data.terms || null,
      whatsapp_receipt_template: data.whatsapp_receipt_template,
      whatsapp_statement_template: data.whatsapp_statement_template,
      email_subject_template: data.email_subject_template,
      email_body_template: data.email_body_template,
      whatsapp_doc_request_template: data.whatsapp_doc_request_template || null,
      email_doc_request_template: data.email_doc_request_template || null,
      admins_can_void: data.admins_can_void,
      support_access_enabled: data.support_access_enabled,
      celebration_emails_enabled: data.celebration_emails_enabled,
      show_aed_to_staff: data.show_aed_to_staff,
      monthly_top_performer_notification: data.monthly_top_performer_notification,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('singleton', true)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult<{ logoPath: string }>> {
  const { user } = await requireOwner()
  const supabase = await createClient()

  const file = formData.get('logo') as File | null
  if (!file || !(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Please select a logo file to upload' }
  }

  // Size limit: 1 MB
  const MAX_SIZE = 1024 * 1024
  if (file.size > MAX_SIZE) {
    return { success: false, error: 'Logo file size exceeds 1 MB limit' }
  }

  // Allowed MIME types: image/png or image/svg+xml
  const allowedMimes = ['image/png', 'image/svg+xml']
  if (!allowedMimes.includes(file.type)) {
    return {
      success: false,
      error: `Invalid file format (${file.type}). Only PNG and SVG images are accepted.`,
    }
  }

  const extension = file.type === 'image/svg+xml' ? 'svg' : 'png'
  const fileName = `logo-${Date.now()}.${extension}`
  const filePath = `company/${fileName}`

  // Convert File to ArrayBuffer for upload
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload to branding bucket
  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` }
  }

  // Update company_settings logo_path
  const { error: updateError } = await supabase
    .from('company_settings')
    .update({
      logo_path: filePath,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('singleton', true)

  if (updateError) {
    return { success: false, error: `Failed to update company logo record: ${updateError.message}` }
  }

  revalidatePath('/admin/settings')
  return { success: true, data: { logoPath: filePath } }
}

export async function toggleSupportAccessAction(enabled: boolean): Promise<ActionResult> {
  const { user } = await requireOwner()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_settings')
    .update({
      support_access_enabled: enabled,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('singleton', true)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function toggleAdminsCanVoidAction(enabled: boolean): Promise<ActionResult> {
  const { user } = await requireOwner()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_settings')
    .update({
      admins_can_void: enabled,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('singleton', true)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}
