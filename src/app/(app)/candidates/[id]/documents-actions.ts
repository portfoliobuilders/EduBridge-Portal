'use server'

import { revalidatePath } from 'next/cache'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import {
  validateAndProcessServerFile,
  generateStoragePath,
} from '@/lib/documents/server-validate'

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export async function uploadStaffDocumentAction(
  formData: FormData
): Promise<ActionResult<{ documentId: string; fileName: string; sizeBytes: number }>> {
  try {
    const { user } = await requireUser()
    const studentId = formData.get('studentId') as string
    const documentTypeId = formData.get('documentTypeId') as string
    const idProofKind = (formData.get('idProofKind') as string) || null
    const title = (formData.get('title') as string) || ''
    const file = formData.get('file') as File | null

    if (!studentId || !documentTypeId || !file) {
      return { success: false, error: 'Student ID, document type, and file are required.' }
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Validate file
    const validation = await validateAndProcessServerFile(buffer, file.name)
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid file uploaded.' }
    }

    const admin = createAdminClient()

    // Fetch candidate and document type metadata for path generation
    const [
      { data: student, error: studentErr },
      { data: docType, error: docTypeErr },
    ] = await Promise.all([
      admin.from('students').select('student_code, full_name').eq('id', studentId).single(),
      admin.from('document_types').select('name, slug').eq('id', documentTypeId).single(),
    ])

    if (studentErr || !student || docTypeErr || !docType) {
      return { success: false, error: 'Candidate or document type not found.' }
    }

    const ext = validation.mimeType === 'application/pdf' ? 'pdf' : 'jpg'
    const filePath = generateStoragePath({
      studentCode: student.student_code,
      studentName: student.full_name,
      docTypeSlug: docType.slug,
      extension: ext,
    })

    // Upload to private bucket
    const { error: uploadErr } = await admin.storage
      .from('candidate-documents')
      .upload(filePath, validation.cleanedBuffer, {
        contentType: validation.mimeType,
        upsert: false,
      })

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return { success: false, error: `Upload failed: ${uploadErr.message}` }
    }

    // Insert database record
    const docTitle = title.trim() || docType.name
    const { data: docRecord, error: insertErr } = await admin
      .from('candidate_documents')
      .insert({
        student_id: studentId,
        document_type_id: documentTypeId,
        id_proof_kind: idProofKind as 'aadhaar_masked' | 'passport' | null,
        title: docTitle,
        file_path: filePath,
        file_name: file.name,
        mime_type: validation.mimeType,
        size_bytes: validation.cleanedBuffer.length,
        original_size_bytes: buffer.length,
        status: 'received',
        uploaded_via: 'staff',
        uploaded_by: user.id,
      })
      .select('id, file_name, size_bytes')
      .single()

    if (insertErr || !docRecord) {
      console.error('Insert candidate_document error:', insertErr)
      return { success: false, error: 'Failed to record document in database.' }
    }

    // Log access
    await admin.from('document_access_log').insert({
      document_id: docRecord.id,
      actor: user.id,
      action: 'upload',
      metadata: { file_name: file.name, size_bytes: validation.cleanedBuffer.length },
    })

    revalidatePath(`/candidates/${studentId}`)
    return {
      success: true,
      data: {
        documentId: docRecord.id,
        fileName: docRecord.file_name,
        sizeBytes: docRecord.size_bytes,
      },
    }
  } catch (err: unknown) {
    console.error('uploadStaffDocumentAction exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred during upload.',
    }
  }
}

export async function getDocumentSignedUrlAction(params: {
  documentId: string
  action?: 'view' | 'download'
}): Promise<ActionResult<{ url: string; fileName: string; mimeType: string }>> {
  try {
    const { user } = await requireUser()
    const admin = createAdminClient()

    const { data: doc, error: docErr } = await admin
      .from('candidate_documents')
      .select('id, student_id, file_path, file_name, mime_type, archived_at')
      .eq('id', params.documentId)
      .single()

    if (docErr || !doc) {
      return { success: false, error: 'Document not found.' }
    }

    // Generate 60-second signed URL
    const { data: signedData, error: signErr } = await admin.storage
      .from('candidate-documents')
      .createSignedUrl(doc.file_path, 60, {
        download: params.action === 'download' ? doc.file_name : false,
      })

    if (signErr || !signedData?.signedUrl) {
      return { success: false, error: 'Could not generate secure view URL.' }
    }

    // Log view or download action
    await admin.from('document_access_log').insert({
      document_id: doc.id,
      actor: user.id,
      action: params.action === 'download' ? 'download' : 'view',
      metadata: { file_name: doc.file_name },
    })

    return {
      success: true,
      data: {
        url: signedData.signedUrl,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
      },
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error generating document URL.',
    }
  }
}

export async function verifyCandidateDocumentAction(params: {
  documentId: string
  status: 'verified' | 'rejected' | 'received'
  notes?: string
}): Promise<ActionResult> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('verify_candidate_document', {
      p_document_id: params.documentId,
      p_status: params.status,
      p_notes: params.notes || undefined,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data?.student_id) {
      revalidatePath(`/candidates/${data.student_id}`)
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Verification failed.',
    }
  }
}

export async function archiveCandidateDocumentAction(params: {
  documentId: string
}): Promise<ActionResult> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('archive_candidate_document', {
      p_document_id: params.documentId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data?.student_id) {
      revalidatePath(`/candidates/${data.student_id}`)
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Archiving failed.',
    }
  }
}

export async function createDocumentUploadLinkAction(params: {
  studentId: string
  requestedTypes: string[]
  expiryDays: number
}): Promise<ActionResult<{ linkId: string; token: string; url: string; expiresAt: string }>> {
  try {
    const { user } = await requireUser()
    const admin = createAdminClient()

    if (!params.studentId || !params.requestedTypes?.length) {
      return { success: false, error: 'Student and requested document types are required.' }
    }

    const token = crypto.randomBytes(32).toString('hex') // 64-character unique token
    const days = [3, 7, 14].includes(params.expiryDays) ? params.expiryDays : 7
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const { data: link, error: insertErr } = await admin
      .from('document_upload_links')
      .insert({
        student_id: params.studentId,
        token,
        requested_types: params.requestedTypes,
        expires_at: expiresAt,
        created_by: user.id,
      })
      .select('id, token, expires_at')
      .single()

    if (insertErr || !link) {
      return { success: false, error: 'Failed to create document upload link.' }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const fullUrl = `${appUrl}/u/${link.token}`

    revalidatePath(`/candidates/${params.studentId}`)
    return {
      success: true,
      data: {
        linkId: link.id,
        token: link.token,
        url: fullUrl,
        expiresAt: link.expires_at,
      },
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error generating upload link.',
    }
  }
}

export async function revokeDocumentUploadLinkAction(params: {
  linkId: string
}): Promise<ActionResult> {
  try {
    await requireUser()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('revoke_document_upload_link', {
      p_link_id: params.linkId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data?.student_id) {
      revalidatePath(`/candidates/${data.student_id}`)
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Revoking link failed.',
    }
  }
}
