import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { UploadClient } from './UploadClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Upload Documents | EduBridge Education',
  description: 'Secure document upload portal for EduBridge Education candidates.',
  robots: {
    index: false,
    follow: false,
  },
}

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PublicUploadPage({ params }: PageProps) {
  const { token } = await params

  if (!token || token.length !== 64) {
    return (
      <div className="min-h-screen bg-[#F5F6F6] flex flex-col items-center justify-center p-4">
        <div className="bg-white border border-[#E4E7E7] rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="flex justify-center mb-2">
            <Image
              src="/brand/edubridge-logo-color.svg"
              alt="EduBridge Education"
              width={160}
              height={32}
              priority
              style={{ width: 'auto', height: 'auto' }}
              className="h-8 w-auto"
            />
          </div>
          <h1 className="text-xl font-bold text-[#0A0A0A]">Upload Link Expired or Unavailable</h1>
          <p className="text-sm text-[#6B7272]">
            This document upload link has expired or has been revoked. Please contact EduBridge to receive a new upload link.
          </p>
          <div className="pt-2">
            <a
              href="https://wa.me/971581073898"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-[#00A57E] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#00805F] transition"
            >
              Contact EduBridge
            </a>
          </div>
        </div>
      </div>
    )
  }

  const admin = createAdminClient()

  // 1. Fetch link
  const { data: link, error: linkErr } = await admin
    .from('document_upload_links')
    .select('id, student_id, requested_types, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  const now = new Date()
  if (linkErr || !link || link.revoked_at || new Date(link.expires_at) <= now) {
    return (
      <div className="min-h-screen bg-[#F5F6F6] flex flex-col items-center justify-center p-4">
        <div className="bg-white border border-[#E4E7E7] rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="flex justify-center mb-2">
            <Image
              src="/brand/edubridge-logo-color.svg"
              alt="EduBridge Education"
              width={160}
              height={32}
              priority
              style={{ width: 'auto', height: 'auto' }}
              className="h-8 w-auto"
            />
          </div>
          <h1 className="text-xl font-bold text-[#0A0A0A]">Upload Link Expired or Unavailable</h1>
          <p className="text-sm text-[#6B7272]">
            This document upload link has expired or has been revoked. Please contact EduBridge to receive a new upload link.
          </p>
          <div className="pt-2">
            <a
              href="https://wa.me/971581073898"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-[#00A57E] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#00805F] transition"
            >
              Contact EduBridge
            </a>
          </div>
        </div>
      </div>
    )
  }

  // 2. Fetch candidate's FIRST NAME ONLY
  const { data: student, error: studentErr } = await admin
    .from('students')
    .select('full_name')
    .eq('id', link.student_id)
    .single()

  if (studentErr || !student) {
    notFound()
  }

  const firstName = student.full_name.trim().split(/\s+/)[0] || 'Candidate'

  // 3. Fetch requested document types only
  const { data: types, error: typesErr } = await admin
    .from('document_types')
    .select('id, name, slug, helper_text, display_order')
    .in('id', link.requested_types)
    .eq('is_active', true)
    .order('display_order')

  if (typesErr || !types || types.length === 0) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-[#F5F6F6] flex flex-col">
      {/* Brand Header */}
      <header className="bg-white border-b border-[#E4E7E7] py-4 px-6 flex items-center justify-between sticky top-0 z-10 shadow-xs">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/edubridge-logo-color.svg"
            alt="EduBridge Education"
            width={150}
            height={30}
            priority
            style={{ width: 'auto', height: 'auto' }}
            className="h-7 w-auto"
          />
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold text-[#00A57E] bg-[#E6F6F2] px-2.5 py-1 rounded-full">
            Secure Upload
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <UploadClient
          token={token}
          firstName={firstName}
          requestedTypes={types}
          expiresAt={link.expires_at}
        />
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[#6B7272] border-t border-[#E4E7E7] bg-white mt-auto">
        <p>© {new Date().getFullYear()} EduBridge Education. All documents are stored securely.</p>
        <p className="mt-1">Dubai, United Arab Emirates · info@edubridgeeducation.com</p>
      </footer>
    </div>
  )
}
