'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Download,
  CheckCircle,
  XCircle,
  Archive,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  Calendar,
  User,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatFileSize } from '@/lib/documents/client-compress'
import {
  getDocumentSignedUrlAction,
  verifyCandidateDocumentAction,
  archiveCandidateDocumentAction,
} from '@/app/(app)/candidates/[id]/documents-actions'
import { formatDubaiDateTime } from '@/lib/date'
import { toast } from 'sonner'

export interface CandidateDocItem {
  id: string
  student_id: string
  document_type_id: string
  id_proof_kind?: 'aadhaar_masked' | 'passport' | null
  title: string
  file_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  original_size_bytes?: number | null
  status: 'received' | 'verified' | 'rejected'
  uploaded_via: 'staff' | 'candidate_link'
  uploaded_by?: string | null
  upload_link_id?: string | null
  notes?: string | null
  verified_by?: string | null
  verified_at?: string | null
  created_at: string
  archived_at?: string | null
  uploader_name?: string | null
  verifier_name?: string | null
}

interface DocumentViewerModalProps {
  document: CandidateDocItem | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
  isOwnerOrAdmissionStaff: boolean
}

export function DocumentViewerModal({
  document: doc,
  isOpen,
  onClose,
  onUpdate,
  isOwnerOrAdmissionStaff,
}: DocumentViewerModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  // Reject dialog state
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isActionPending, setIsActionPending] = useState(false)

  // Load 60s signed URL on open
  useEffect(() => {
    if (!isOpen || !doc) return

    let isMounted = true
    getDocumentSignedUrlAction({ documentId: doc.id, action: 'view' })
      .then((res) => {
        if (isMounted && res.success && res.data?.url) {
          setSignedUrl(res.data.url)
        } else if (isMounted) {
          toast.error(res.error || 'Failed to load document preview')
        }
      })
      .finally(() => {
        if (isMounted) setLoadingUrl(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, doc])

  const handleClose = () => {
    setSignedUrl(null)
    setZoom(1)
    setRotation(0)
    setIsRejectOpen(false)
    setRejectReason('')
    onClose()
  }

  if (!isOpen || !doc) return null

  const isPdf = doc.mime_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf')

  const handleDownload = async () => {
    const res = await getDocumentSignedUrlAction({ documentId: doc.id, action: 'download' })
    if (res.success && res.data?.url) {
      const a = window.document.createElement('a')
      a.href = res.data.url
      a.download = doc.file_name
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
    } else {
      toast.error(res.error || 'Download failed')
    }
  }

  const handleVerify = async () => {
    setIsActionPending(true)
    const res = await verifyCandidateDocumentAction({
      documentId: doc.id,
      status: 'verified',
    })
    setIsActionPending(false)
    if (res.success) {
      toast.success('Document marked as Verified')
      onUpdate()
      handleClose()
    } else {
      toast.error(res.error || 'Verification failed')
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejecting this document')
      return
    }
    setIsActionPending(true)
    const res = await verifyCandidateDocumentAction({
      documentId: doc.id,
      status: 'rejected',
      notes: rejectReason.trim(),
    })
    setIsActionPending(false)
    if (res.success) {
      toast.success('Document marked as Rejected')
      setIsRejectOpen(false)
      onUpdate()
      handleClose()
    } else {
      toast.error(res.error || 'Rejection failed')
    }
  }

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this document? It will be hidden from the active list.')) {
      return
    }
    setIsActionPending(true)
    const res = await archiveCandidateDocumentAction({ documentId: doc.id })
    setIsActionPending(false)
    if (res.success) {
      toast.success('Document archived')
      onUpdate()
      handleClose()
    } else {
      toast.error(res.error || 'Archiving failed')
    }
  }

  const statusBadge = () => {
    if (doc.status === 'verified') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#00A57E] text-white">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified
        </span>
      )
    }
    if (doc.status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#C53030] text-white">
          <XCircle className="h-3.5 w-3.5" />
          Rejected
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5]">
        <CheckCircle className="h-3.5 w-3.5" />
        Received
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-between overflow-hidden animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <div className="h-16 px-4 sm:px-6 bg-[#0A0A0A] text-white flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold truncate flex items-center gap-2">
              <span>{doc.title}</span>
              {statusBadge()}
            </h2>
            <p className="text-xs text-white/60 truncate">
              {doc.file_name} · {formatFileSize(doc.size_bytes)}
            </p>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-2">
          {!isPdf && signedUrl && (
            <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-lg p-1 mr-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                className="h-7 w-7 text-white hover:bg-white/20"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs px-1 text-white/80">{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                className="h-7 w-7 text-white hover:bg-white/20"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="h-7 w-7 text-white hover:bg-white/20"
                title="Rotate"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="text-white bg-transparent border-white/20 hover:bg-white/10 text-xs h-8 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-9 w-9 text-white hover:bg-white/20 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Center Viewer Area */}
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-auto">
        {loadingUrl ? (
          <div className="flex flex-col items-center gap-3 text-white/80">
            <Loader2 className="h-8 w-8 animate-spin text-[#00A57E]" />
            <span className="text-sm">Loading secure document preview...</span>
          </div>
        ) : !signedUrl ? (
          <div className="flex flex-col items-center gap-3 text-white/60">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <span className="text-sm">Unable to render document preview.</span>
            <Button variant="outline" size="sm" onClick={handleDownload} className="text-white">
              Try Downloading
            </Button>
          </div>
        ) : isPdf ? (
          <iframe
            src={`${signedUrl}#toolbar=0`}
            title={doc.title}
            className="w-full h-full max-w-4xl bg-white rounded-lg shadow-xl"
          />
        ) : (
          <div className="overflow-auto flex items-center justify-center w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt={doc.title}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: 'transform 0.15s ease-out',
              }}
              className="max-h-[75vh] max-w-[90vw] object-contain rounded-md shadow-2xl"
            />
          </div>
        )}
      </div>

      {/* Bottom Metadata & Actions Bar */}
      <div className="bg-[#0A0A0A] border-t border-white/10 px-4 sm:px-6 py-3 text-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-white/50" />
            <span>Uploaded: {formatDubaiDateTime(doc.created_at)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-white/50" />
            <span>
              Via:{' '}
              {doc.uploaded_via === 'staff'
                ? `Staff (${doc.uploader_name || 'Staff'})`
                : 'Candidate self-upload link'}
            </span>
          </div>
          {doc.notes && (
            <div className="w-full sm:w-auto text-amber-300">
              Note: {doc.notes}
            </div>
          )}
        </div>

        {/* Verification & Archive Actions (Owner or admission staff) */}
        {isOwnerOrAdmissionStaff && (
          <div className="flex items-center justify-end gap-2 shrink-0">
            {doc.status !== 'verified' && (
              <Button
                size="sm"
                onClick={handleVerify}
                disabled={isActionPending}
                className="bg-[#00A57E] hover:bg-[#00805F] text-white text-xs h-8 gap-1.5 font-semibold"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Verify</span>
              </Button>
            )}

            {doc.status !== 'rejected' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectOpen(true)}
                disabled={isActionPending}
                className="border-red-400/40 text-red-400 hover:bg-red-950/40 text-xs h-8 gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Reject</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleArchive}
              disabled={isActionPending}
              className="text-white/60 hover:text-white hover:bg-white/10 text-xs h-8 gap-1.5"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Archive</span>
            </Button>
          </div>
        )}
      </div>

      {/* Reject Reason Dialog */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white text-[#0A0A0A] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Reject Document
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsRejectOpen(false)}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-[#6B7272]">
              Please specify why this document is rejected (e.g. blurry, wrong document, unmasked Aadhaar, missing back side).
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter mandatory rejection reason..."
              className="w-full text-xs p-3 border border-[#E4E7E7] rounded-xl focus:outline-none focus:border-red-500"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectOpen(false)}
                disabled={isActionPending}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReject}
                disabled={isActionPending || !rejectReason.trim()}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
