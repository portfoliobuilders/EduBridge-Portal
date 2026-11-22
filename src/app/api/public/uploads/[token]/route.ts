import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateAndProcessServerFile,
  generateStoragePath,
} from '@/lib/documents/server-validate'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ token: string }>
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
}

// GET /api/public/uploads/[token]
// Returns candidate first name and requested types only (upload-only)
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    if (!token || token.length !== 64) {
      return NextResponse.json({ error: 'This link is invalid or expired.' }, { status: 404 })
    }

    const ip = getClientIp(req)
    const admin = createAdminClient()

    // Rate limit check: 60 GET requests/hour per IP
    const { data: isLimited } = await admin.rpc('hit_rate_limit', {
      p_key: `doc_link_get:${ip}`,
      p_limit: 60,
      p_window_seconds: 3600,
    })

    if (isLimited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    // Lookup link
    const { data: link, error: linkErr } = await admin
      .from('document_upload_links')
      .select('id, student_id, requested_types, expires_at, revoked_at')
      .eq('token', token)
      .maybeSingle()

    if (linkErr || !link) {
      return NextResponse.json({ error: 'This link has expired. Please contact EduBridge.' }, { status: 404 })
    }

    // Check expiry and revocation
    const now = new Date()
    if (link.revoked_at || new Date(link.expires_at) <= now) {
      return NextResponse.json({ error: 'This link has expired. Please contact EduBridge.' }, { status: 404 })
    }

    // Lookup candidate first name ONLY
    const { data: student, error: studentErr } = await admin
      .from('students')
      .select('full_name')
      .eq('id', link.student_id)
      .single()

    if (studentErr || !student) {
      return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })
    }

    const firstName = student.full_name.trim().split(/\s+/)[0] || 'Candidate'

    // Lookup only the requested document types
    const { data: types, error: typesErr } = await admin
      .from('document_types')
      .select('id, name, slug, helper_text, display_order')
      .in('id', link.requested_types)
      .eq('is_active', true)
      .order('display_order')

    if (typesErr || !types) {
      return NextResponse.json({ error: 'Could not load requested document types.' }, { status: 500 })
    }

    return NextResponse.json({
      valid: true,
      firstName,
      expiresAt: link.expires_at,
      requestedTypes: types,
    })
  } catch (err: unknown) {
    console.error('Error fetching public upload link:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

// POST /api/public/uploads/[token]
// Handles file upload from the candidate self-upload page
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    if (!token || token.length !== 64) {
      return NextResponse.json({ error: 'Invalid upload token.' }, { status: 404 })
    }

    const ip = getClientIp(req)
    const admin = createAdminClient()

    // 1. Rate limit per token and IP: 30 uploads/hour
    const { data: isTokenLimited } = await admin.rpc('hit_rate_limit', {
      p_key: `doc_link_upload:${token}`,
      p_limit: 30,
      p_window_seconds: 3600,
    })

    const { data: isIpLimited } = await admin.rpc('hit_rate_limit', {
      p_key: `doc_ip_upload:${ip}`,
      p_limit: 30,
      p_window_seconds: 3600,
    })

    if (isTokenLimited || isIpLimited) {
      return NextResponse.json(
        { error: 'Upload rate limit reached (max 30 uploads per hour). Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Validate token
    const { data: link, error: linkErr } = await admin
      .from('document_upload_links')
      .select('id, student_id, requested_types, expires_at, revoked_at, upload_count')
      .eq('token', token)
      .maybeSingle()

    if (linkErr || !link) {
      return NextResponse.json({ error: 'This link has expired. Please contact EduBridge.' }, { status: 404 })
    }

    const now = new Date()
    if (link.revoked_at || new Date(link.expires_at) <= now) {
      return NextResponse.json({ error: 'This link has expired. Please contact EduBridge.' }, { status: 404 })
    }

    // 3. Daily limit: max 20 files per candidate per day via link
    const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: dailyCount } = await admin
      .from('candidate_documents')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', link.student_id)
      .eq('uploaded_via', 'candidate_link')
      .gte('created_at', past24h)

    if (dailyCount !== null && dailyCount >= 20) {
      return NextResponse.json(
        { error: 'Daily upload limit reached for this candidate (max 20 files per day). Please contact your EduBridge counselor.' },
        { status: 429 }
      )
    }

    // 4. Parse multipart form data
    const formData = await req.formData()
    const documentTypeId = formData.get('documentTypeId') as string
    const idProofKind = (formData.get('idProofKind') as string) || null
    const title = (formData.get('title') as string) || ''
    const file = formData.get('file') as File | null

    if (!documentTypeId || !file) {
      return NextResponse.json({ error: 'Document type and file are required.' }, { status: 400 })
    }

    // Verify documentTypeId is in requested_types
    if (!link.requested_types.includes(documentTypeId)) {
      return NextResponse.json(
        { error: 'This document type was not requested for upload with this link.' },
        { status: 403 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 5. Server validation (magic bytes, limits, EXIF strip)
    const validation = await validateAndProcessServerFile(buffer, file.name)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // 6. Fetch metadata for path generation
    const [
      { data: student, error: studentErr },
      { data: docType, error: docTypeErr },
    ] = await Promise.all([
      admin.from('students').select('student_code, full_name').eq('id', link.student_id).single(),
      admin.from('document_types').select('name, slug').eq('id', documentTypeId).single(),
    ])

    if (studentErr || !student || docTypeErr || !docType) {
      return NextResponse.json({ error: 'Candidate or document type not found.' }, { status: 404 })
    }

    const ext = validation.mimeType === 'application/pdf' ? 'pdf' : 'jpg'
    const filePath = generateStoragePath({
      studentCode: student.student_code,
      studentName: student.full_name,
      docTypeSlug: docType.slug,
      extension: ext,
    })

    // 7. Upload to private bucket
    const { error: uploadErr } = await admin.storage
      .from('candidate-documents')
      .upload(filePath, validation.cleanedBuffer, {
        contentType: validation.mimeType,
        upsert: false,
      })

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 })
    }

    // 8. Record in database
    const docTitle = title.trim() || docType.name
    const { data: docRecord, error: insertErr } = await admin
      .from('candidate_documents')
      .insert({
        student_id: link.student_id,
        document_type_id: documentTypeId,
        id_proof_kind: idProofKind as 'aadhaar_masked' | 'passport' | null,
        title: docTitle,
        file_path: filePath,
        file_name: file.name,
        mime_type: validation.mimeType,
        size_bytes: validation.cleanedBuffer.length,
        original_size_bytes: buffer.length,
        status: 'received',
        uploaded_via: 'candidate_link',
        uploaded_by: null,
        upload_link_id: link.id,
      })
      .select('id, title, file_name, size_bytes')
      .single()

    if (insertErr || !docRecord) {
      console.error('Insert candidate_document error:', insertErr)
      return NextResponse.json({ error: 'Failed to record document.' }, { status: 500 })
    }

    // 9. Update link stats and log access
    await Promise.all([
      admin
        .from('document_upload_links')
        .update({
          upload_count: (link.upload_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', link.id),
      admin.from('document_access_log').insert({
        document_id: docRecord.id,
        actor: 'candidate_link',
        action: 'upload',
        ip,
        metadata: { file_name: file.name, size_bytes: validation.cleanedBuffer.length, link_id: link.id },
      }),
    ])

    return NextResponse.json({
      success: true,
      document: {
        id: docRecord.id,
        title: docRecord.title,
        fileName: docRecord.file_name,
        sizeBytes: docRecord.size_bytes,
      },
    })
  } catch (err: unknown) {
    console.error('POST /api/public/uploads error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'An error occurred during upload.' },
      { status: 500 }
    )
  }
}
