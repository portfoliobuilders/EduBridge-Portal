import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireUser()
    const { id: studentId } = await context.params

    if (!studentId) {
      return NextResponse.json({ error: 'Candidate ID is required.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Fetch candidate
    const { data: student, error: studentErr } = await admin
      .from('students')
      .select('student_code, full_name')
      .eq('id', studentId)
      .single()

    if (studentErr || !student) {
      return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })
    }

    // 2. Fetch all active documents for this candidate
    const { data: docs, error: docsErr } = await admin
      .from('candidate_documents')
      .select(`
        id,
        file_path,
        file_name,
        title,
        document_type:document_types (
          name,
          slug
        )
      `)
      .eq('student_id', studentId)
      .is('archived_at', null)

    if (docsErr || !docs || docs.length === 0) {
      return NextResponse.json(
        { error: 'No documents available for download.' },
        { status: 404 }
      )
    }

    // 3. Create ZIP archive
    const zip = new JSZip()
    const cleanStudentName = student.full_name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    const zipFileName = `${student.student_code}_${cleanStudentName}_documents.zip`

    for (const doc of docs) {
      const { data: fileData, error: downloadErr } = await admin.storage
        .from('candidate-documents')
        .download(doc.file_path)

      if (downloadErr || !fileData) {
        console.warn(`Could not download file ${doc.file_path}:`, downloadErr)
        continue
      }

      const typeObj = Array.isArray(doc.document_type)
        ? doc.document_type[0]
        : doc.document_type
      const folderName = typeObj?.slug || 'other'
      const arrayBuffer = await fileData.arrayBuffer()

      // Add to folder in zip
      zip.file(`${folderName}/${doc.file_name}`, arrayBuffer)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    // 4. Log zip action in access log
    await admin.from('document_access_log').insert({
      actor: user.id,
      action: 'zip',
      metadata: { student_id: studentId, file_count: docs.length, zip_name: zipFileName },
    })

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    console.error('Error creating document ZIP:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generating documents ZIP.' },
      { status: 500 }
    )
  }
}
