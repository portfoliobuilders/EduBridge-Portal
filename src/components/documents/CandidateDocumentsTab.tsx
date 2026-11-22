'use client'

import React, { useState, useRef } from 'react'
import {
  FileText,
  Upload,
  Camera,
  XCircle,
  Clock,
  Download,
  Link as LinkIcon,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatDubaiDateTime } from '@/lib/date'
import { formatFileSize, processFileForUpload } from '@/lib/documents/client-compress'
import { uploadStaffDocumentAction } from '@/app/(app)/candidates/[id]/documents-actions'
import { DocumentViewerModal, type CandidateDocItem } from './DocumentViewerModal'
import {
  RequestDocumentsModal,
  type UploadLinkItem,
} from './RequestDocumentsModal'

export interface DocumentTypeFull {
  id: string
  name: string
  slug: string
  helper_text: string | null
  display_order: number
}

interface CandidateDocumentsTabProps {
  studentId: string
  studentName: string
  studentCode: string
  studentPhone: string
  studentEmail?: string | null
  guardianPhone?: string | null
  documentTypes: DocumentTypeFull[]
  documents: CandidateDocItem[]
  uploadLinks: UploadLinkItem[]
  isOwnerOrAdmissionStaff: boolean
  whatsappTemplate?: string | null
  onRefresh: () => void
}

export function CandidateDocumentsTab({
  studentId,
  studentName,
  studentCode,
  studentPhone,
  studentEmail,
  guardianPhone,
  documentTypes,
  documents,
  uploadLinks,
  isOwnerOrAdmissionStaff,
  whatsappTemplate,
  onRefresh,
}: CandidateDocumentsTabProps) {
  // Modal states
  const [selectedDocForView, setSelectedDocForView] = useState<CandidateDocItem | null>(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)

  // Uploading state per card
  const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({})
  const [compressingText, setCompressingText] = useState<Record<string, string>>({})
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [dragOverCard, setDragOverCard] = useState<string | null>(null)
  const [isZipping, setIsZipping] = useState(false)

  // Sub-choice states for ID proof and other title
  const [idProofKind, setIdProofKind] = useState<Record<string, 'aadhaar_masked' | 'passport'>>({})
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({})

  // File input refs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Compute summary (excluding 'other' from denominator)
  const standardTypes = documentTypes.filter((t) => t.slug !== 'other')
  const uploadedTypeIds = new Set(
    documents.filter((d) => !d.archived_at).map((d) => d.document_type_id)
  )
  const uploadedStandardCount = standardTypes.filter((t) => uploadedTypeIds.has(t.id)).length
  const totalStandardCount = standardTypes.length

  const handleUploadFile = async (docType: DocumentTypeFull, file: File) => {
    const typeId = docType.id
    setCardErrors((prev) => ({ ...prev, [typeId]: '' }))
    setCompressingText((prev) => ({ ...prev, [typeId]: 'Compressing file...' }))
    setUploadingState((prev) => ({ ...prev, [typeId]: true }))

    try {
      const isPhoto = docType.slug === 'passport-size-photo'
      const processed = await processFileForUpload(file, isPhoto)

      const beforeStr = formatFileSize(processed.originalSize)
      const afterStr = formatFileSize(processed.compressedSize)
      setCompressingText((prev) => ({
        ...prev,
        [typeId]: `Optimized: ${beforeStr} → ${afterStr}. Uploading...`,
      }))

      const formData = new FormData()
      formData.append('studentId', studentId)
      formData.append('documentTypeId', typeId)
      formData.append('file', processed.file)

      if (docType.slug === 'id-proof-aadhaar-passport') {
        const choice = idProofKind[typeId] || 'aadhaar_masked'
        formData.append('idProofKind', choice)
        formData.append('title', choice === 'passport' ? 'Passport Copy' : 'Masked Aadhaar')
      } else if (docType.slug === 'other') {
        const custom = customTitles[typeId]?.trim() || 'Other Document'
        formData.append('title', custom)
      } else {
        formData.append('title', docType.name)
      }

      const res = await uploadStaffDocumentAction(formData)

      if (res.success) {
        toast.success(`${docType.name} uploaded successfully!`)
        onRefresh()
      } else {
        throw new Error(res.error || 'Upload failed')
      }
    } catch (err: unknown) {
      console.error('Staff upload error:', err)
      setCardErrors((prev) => ({
        ...prev,
        [typeId]: err instanceof Error ? err.message : 'Upload failed',
      }))
    } finally {
      setUploadingState((prev) => ({ ...prev, [typeId]: false }))
      setCompressingText((prev) => ({ ...prev, [typeId]: '' }))
    }
  }

  const handleDownloadAllZip = async () => {
    setIsZipping(true)
    try {
      const res = await fetch(`/api/candidates/${studentId}/documents/zip`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to download documents')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${studentCode}_${studentName.toLowerCase().replace(/\s+/g, '_')}_documents.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Documents ZIP downloaded successfully!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error generating ZIP')
    } finally {
      setIsZipping(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Summary & Action Bar */}
      <div className="bg-white border border-[#E4E7E7] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-bold text-[#0A0A0A]">
              Candidate Documents
            </h2>
            <Badge
              variant="outline"
              className="bg-[#E6F6F2] text-[#00805F] border-[#CCEDE5] font-semibold text-xs py-0.5"
            >
              {uploadedStandardCount} of {totalStandardCount} types uploaded
            </Badge>
          </div>
          <p className="text-xs text-[#6B7272]">
            Staff uploads and candidate self-uploads are stored securely in a private repository. Nothing is mandatory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadAllZip}
            disabled={isZipping || documents.filter((d) => !d.archived_at).length === 0}
            className="border-[#E4E7E7] h-10 px-4 rounded-xl text-xs font-semibold gap-2 shadow-xs"
          >
            {isZipping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#00A57E]" />
                <span>Preparing ZIP...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4 text-[#00A57E]" />
                <span>Download All (ZIP)</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="bg-[#00A57E] hover:bg-[#00805F] text-white h-10 px-4 rounded-xl text-xs font-semibold gap-2 shadow-xs"
          >
            <LinkIcon className="h-4 w-4" />
            <span>Request Documents</span>
          </Button>
        </div>
      </div>

      {/* Document Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {documentTypes.map((docType) => {
          const typeId = docType.id
          const activeDocs = documents.filter(
            (d) => d.document_type_id === typeId && !d.archived_at
          )
          const isUploading = uploadingState[typeId]
          const compressText = compressingText[typeId]
          const errorMsg = cardErrors[typeId]
          const isIdProof = docType.slug === 'id-proof-aadhaar-passport'
          const selectedIdKind = idProofKind[typeId] || 'aadhaar_masked'
          const isOther = docType.slug === 'other'
          const isDragOver = dragOverCard === typeId

          return (
            <div
              key={docType.id}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverCard(typeId)
              }}
              onDragLeave={() => setDragOverCard(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverCard(null)
                const f = e.dataTransfer.files?.[0]
                if (f) handleUploadFile(docType, f)
              }}
              className={`bg-white border rounded-2xl p-5 shadow-xs transition flex flex-col justify-between space-y-4 ${
                isDragOver
                  ? 'border-[#00A57E] bg-[#E6F6F2]/30 ring-2 ring-[#00A57E]/20'
                  : 'border-[#E4E7E7] hover:border-gray-300'
              }`}
            >
              {/* Card Header */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-[#0A0A0A]">
                    {docType.name}
                  </h3>
                  {activeDocs.length > 0 ? (
                    <span className="text-[11px] font-semibold text-[#00A57E] bg-[#E6F6F2] px-2 py-0.5 rounded-full shrink-0">
                      {activeDocs.length} {activeDocs.length === 1 ? 'file' : 'files'}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                      Not uploaded
                    </span>
                  )}
                </div>
                {docType.helper_text && (
                  <p className="text-xs text-[#6B7272] leading-relaxed">
                    {docType.helper_text}
                  </p>
                )}
              </div>

              {/* Sub-selectors (ID Proof kind / Other Title) */}
              {isIdProof && (
                <div className="space-y-2 pt-1 border-t border-[#E4E7E7]/60">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#0A0A0A]">Type:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setIdProofKind((prev) => ({ ...prev, [typeId]: 'aadhaar_masked' }))
                      }
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        selectedIdKind === 'aadhaar_masked'
                          ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                          : 'border-[#E4E7E7] text-[#6B7272]'
                      }`}
                    >
                      Masked Aadhaar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdProofKind((prev) => ({ ...prev, [typeId]: 'passport' }))
                      }
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        selectedIdKind === 'passport'
                          ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                          : 'border-[#E4E7E7] text-[#6B7272]'
                      }`}
                    >
                      Passport
                    </button>
                  </div>
                </div>
              )}

              {isOther && (
                <div className="space-y-1 pt-1 border-t border-[#E4E7E7]/60">
                  <input
                    type="text"
                    placeholder="Document Title (e.g. CV, SOP, Work Exp)"
                    value={customTitles[typeId] || ''}
                    onChange={(e) =>
                      setCustomTitles((prev) => ({ ...prev, [typeId]: e.target.value }))
                    }
                    className="w-full text-xs p-2 border border-[#E4E7E7] rounded-lg focus:outline-none focus:border-[#00A57E]"
                  />
                </div>
              )}

              {/* Uploaded Files Section */}
              {activeDocs.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-[#E4E7E7]/60">
                  <div className="space-y-1.5">
                    {activeDocs.map((doc) => {
                      const isVerified = doc.status === 'verified'
                      const isRejected = doc.status === 'rejected'

                      return (
                        <div
                          key={doc.id}
                          onClick={() => {
                            setSelectedDocForView(doc)
                            setIsViewerOpen(true)
                          }}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-[#E4E7E7] hover:bg-[#F5F6F6] cursor-pointer transition group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 bg-[#E6F6F2] rounded-lg flex items-center justify-center shrink-0 text-[#00A57E]">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#0A0A0A] truncate group-hover:text-[#00A57E]">
                                {doc.file_name}
                              </p>
                              <p className="text-[11px] text-[#6B7272]">
                                {formatFileSize(doc.size_bytes)} · {formatDubaiDateTime(doc.created_at)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isVerified && (
                              <span className="text-[10px] font-semibold text-white bg-[#00A57E] px-2 py-0.5 rounded-full flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                Verified
                              </span>
                            )}
                            {isRejected && (
                              <span className="text-[10px] font-semibold text-white bg-[#C53030] px-2 py-0.5 rounded-full flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                Rejected
                              </span>
                            )}
                            {!isVerified && !isRejected && (
                              <span className="text-[10px] font-semibold text-[#00805F] bg-[#E6F6F2] px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Received
                              </span>
                            )}
                            <Eye className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[#00A57E]" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-[#E4E7E7] rounded-xl text-center text-xs text-muted-foreground bg-[#F5F6F6]/40">
                  <span>Drag and drop file here, or use the buttons below</span>
                </div>
              )}

              {/* Status / Error feedback */}
              {isUploading && (
                <div className="flex items-center gap-2 p-2.5 bg-[#E6F6F2] rounded-xl text-xs text-[#00805F]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>{compressText || 'Uploading...'}</span>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {/* Upload Controls */}
              <div className="pt-2 border-t border-[#E4E7E7]/60 flex items-center gap-2">
                {/* Desktop/General file picker */}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf,image/heic,image/heif"
                  className="hidden"
                  ref={(el) => {
                    fileInputRefs.current[typeId] = el
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUploadFile(docType, f)
                    e.target.value = ''
                  }}
                  disabled={isUploading}
                />

                {/* Mobile camera input */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={(el) => {
                    cameraInputRefs.current[typeId] = el
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUploadFile(docType, f)
                    e.target.value = ''
                  }}
                  disabled={isUploading}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRefs.current[typeId]?.click()}
                  disabled={isUploading}
                  className="flex-1 border-[#E4E7E7] hover:border-[#00A57E] hover:bg-[#E6F6F2] text-xs h-9 font-medium gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5 text-[#00A57E]" />
                  <span>Upload File</span>
                </Button>

                {/* Mobile camera shortcut */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cameraInputRefs.current[typeId]?.click()}
                  disabled={isUploading}
                  className="border-[#E4E7E7] hover:border-[#00A57E] hover:bg-[#E6F6F2] text-xs h-9 px-3 shrink-0"
                  title="Take photo using camera"
                >
                  <Camera className="h-3.5 w-3.5 text-[#00A57E]" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modals */}
      <DocumentViewerModal
        document={selectedDocForView}
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false)
          setSelectedDocForView(null)
        }}
        onUpdate={onRefresh}
        isOwnerOrAdmissionStaff={isOwnerOrAdmissionStaff}
      />

      <RequestDocumentsModal
        studentId={studentId}
        studentName={studentName}
        studentPhone={studentPhone}
        studentEmail={studentEmail}
        guardianPhone={guardianPhone}
        documentTypes={documentTypes}
        existingLinks={uploadLinks}
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onLinkCreated={onRefresh}
        whatsappTemplate={whatsappTemplate}
      />
    </div>
  )
}
