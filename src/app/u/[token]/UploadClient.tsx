'use client'

import React, { useState, useRef } from 'react'
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  Info,
  ShieldCheck,
} from 'lucide-react'
import { processFileForUpload, formatFileSize } from '@/lib/documents/client-compress'

interface DocumentTypeItem {
  id: string
  name: string
  slug: string
  helper_text: string | null
  display_order: number
}

interface UploadClientProps {
  token: string
  firstName: string
  requestedTypes: DocumentTypeItem[]
  expiresAt: string
}

interface SessionUpload {
  id: string
  documentTypeId: string
  fileName: string
  previewUrl: string
  sizeFormatted: string
}

export function UploadClient({
  token,
  firstName,
  requestedTypes,
  expiresAt,
}: UploadClientProps) {
  const [activeUploads, setActiveUploads] = useState<Record<string, boolean>>({})
  const [compressingState, setCompressingState] = useState<Record<string, string>>({})
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({})
  const [uploadedSession, setUploadedSession] = useState<SessionUpload[]>([])
  const [idProofChoices, setIdProofChoices] = useState<Record<string, 'aadhaar_masked' | 'passport'>>({})
  const [otherTitles, setOtherTitles] = useState<Record<string, string>>({})

  // File input refs for each card (camera and gallery)
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const expiryFormatted = new Date(expiresAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const handleFileSelected = async (docType: DocumentTypeItem, file: File) => {
    const typeId = docType.id
    setErrorMessages((prev) => ({ ...prev, [typeId]: '' }))
    setCompressingState((prev) => ({ ...prev, [typeId]: 'Preparing and compressing file...' }))

    try {
      const isPhoto = docType.slug === 'passport-size-photo'
      const processed = await processFileForUpload(file, isPhoto)

      // Show size reduction banner
      const beforeStr = formatFileSize(processed.originalSize)
      const afterStr = formatFileSize(processed.compressedSize)
      setCompressingState((prev) => ({
        ...prev,
        [typeId]: `Optimized: ${beforeStr} → ${afterStr}. Uploading...`,
      }))
      setActiveUploads((prev) => ({ ...prev, [typeId]: true }))

      // Prepare form data
      const formData = new FormData()
      formData.append('documentTypeId', typeId)
      formData.append('file', processed.file)

      if (docType.slug === 'id-proof-aadhaar-passport') {
        const choice = idProofChoices[typeId] || 'aadhaar_masked'
        formData.append('idProofKind', choice)
        formData.append('title', choice === 'passport' ? 'Passport Copy' : 'Masked Aadhaar')
      } else if (docType.slug === 'other') {
        const customTitle = otherTitles[typeId]?.trim() || 'Other Document'
        formData.append('title', customTitle)
      } else {
        formData.append('title', docType.name)
      }

      // POST to public endpoint
      const res = await fetch(`/api/public/uploads/${token}`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed. Please try again.')
      }

      // Success
      setUploadedSession((prev) => [
        ...prev,
        {
          id: data.document.id,
          documentTypeId: typeId,
          fileName: processed.file.name,
          previewUrl: processed.previewUrl,
          sizeFormatted: afterStr,
        },
      ])
    } catch (err: unknown) {
      console.error('Upload error:', err)
      setErrorMessages((prev) => ({
        ...prev,
        [typeId]: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      }))
    } finally {
      setActiveUploads((prev) => ({ ...prev, [typeId]: false }))
      setCompressingState((prev) => ({ ...prev, [typeId]: '' }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-[#E4E7E7] rounded-2xl p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-[#00A57E]" />
          <h1 className="text-xl sm:text-2xl font-bold text-[#0A0A0A]">
            Welcome, {firstName}!
          </h1>
        </div>
        <p className="text-sm text-[#0A0A0A] leading-relaxed">
          Please upload your requested documents securely to EduBridge Education. This link is valid until{' '}
          <span className="font-semibold text-[#00A57E]">{expiryFormatted}</span>.
        </p>

        {/* Tips Box */}
        <div className="bg-[#E6F6F2] border border-[#CCEDE5] rounded-xl p-3.5 flex items-start gap-3 text-xs text-[#00805F] leading-relaxed">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Helpful Tips: </span>
            Use good light, place the document flat, all 4 corners visible. PDFs must be under 2 MB.
          </div>
        </div>
      </div>

      {/* Requested Document Cards */}
      <div className="space-y-4">
        {requestedTypes.map((docType) => {
          const typeId = docType.id
          const isUploading = activeUploads[typeId]
          const compressText = compressingState[typeId]
          const errorText = errorMessages[typeId]
          const sessionFiles = uploadedSession.filter((u) => u.documentTypeId === typeId)
          const isIdProof = docType.slug === 'id-proof-aadhaar-passport'
          const selectedIdProof = idProofChoices[typeId] || 'aadhaar_masked'
          const isOther = docType.slug === 'other'

          return (
            <div
              key={docType.id}
              className="bg-white border border-[#E4E7E7] rounded-2xl p-5 shadow-xs transition hover:border-[#00A57E]/50 space-y-4"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base text-[#0A0A0A]">{docType.name}</h3>
                    {sessionFiles.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00A57E] bg-[#E6F6F2] px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        Uploaded ({sessionFiles.length})
                      </span>
                    )}
                  </div>
                  {docType.helper_text && (
                    <p className="text-xs text-[#6B7272] leading-relaxed">{docType.helper_text}</p>
                  )}
                </div>
              </div>

              {/* ID Proof Selector */}
              {isIdProof && (
                <div className="space-y-2 pt-1 pb-1">
                  <label className="text-xs font-semibold text-[#0A0A0A] block">
                    Select Document Type to Upload:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setIdProofChoices((prev) => ({ ...prev, [typeId]: 'aadhaar_masked' }))
                      }
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition ${
                        selectedIdProof === 'aadhaar_masked'
                          ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                          : 'border-[#E4E7E7] bg-white text-[#6B7272] hover:bg-[#F5F6F6]'
                      }`}
                    >
                      Masked Aadhaar Card
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdProofChoices((prev) => ({ ...prev, [typeId]: 'passport' }))
                      }
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition ${
                        selectedIdProof === 'passport'
                          ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                          : 'border-[#E4E7E7] bg-white text-[#6B7272] hover:bg-[#F5F6F6]'
                      }`}
                    >
                      Passport (Front & Back)
                    </button>
                  </div>
                  {selectedIdProof === 'aadhaar_masked' && (
                    <p className="text-[11px] text-[#B7791F] bg-amber-50 p-2 rounded-lg border border-amber-200">
                      <strong>Important:</strong> Upload only the <strong>MASKED</strong> Aadhaar (only last 4 digits visible) downloaded from mAadhaar or myaadhaar.uidai.gov.in.
                    </p>
                  )}
                </div>
              )}

              {/* Other Document Title Input */}
              {isOther && (
                <div className="space-y-1.5 pt-1">
                  <label htmlFor={`title-${typeId}`} className="text-xs font-semibold text-[#0A0A0A]">
                    Document Title:
                  </label>
                  <input
                    id={`title-${typeId}`}
                    type="text"
                    placeholder="e.g. Experience Certificate, SOP, CV"
                    value={otherTitles[typeId] || ''}
                    onChange={(e) =>
                      setOtherTitles((prev) => ({ ...prev, [typeId]: e.target.value }))
                    }
                    className="w-full text-xs p-2.5 border border-[#E4E7E7] rounded-xl focus:outline-none focus:border-[#00A57E]"
                  />
                </div>
              )}

              {/* Upload Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* 1. Camera Input */}
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
                    if (f) handleFileSelected(docType, f)
                    e.target.value = ''
                  }}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRefs.current[typeId]?.click()}
                  disabled={isUploading}
                  className="h-11 px-4 rounded-xl border border-[#00A57E] text-[#00805F] hover:bg-[#E6F6F2] font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  <span>Take photo</span>
                </button>

                {/* 2. Gallery / File Input */}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf,image/heic,image/heif"
                  className="hidden"
                  ref={(el) => {
                    galleryInputRefs.current[typeId] = el
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileSelected(docType, f)
                    e.target.value = ''
                  }}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  onClick={() => galleryInputRefs.current[typeId]?.click()}
                  disabled={isUploading}
                  className="h-11 px-4 rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose from gallery / files</span>
                </button>
              </div>

              {/* Status & Progress Feedback */}
              {isUploading && (
                <div className="flex items-center gap-2 p-3 bg-[#E6F6F2] rounded-xl text-xs text-[#00805F]">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{compressText || 'Processing upload...'}</span>
                </div>
              )}

              {/* Error Message */}
              {errorText && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorText}</span>
                </div>
              )}

              {/* Session Uploaded Thumbnails (this session only, upload-only) */}
              {sessionFiles.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#E4E7E7]/60">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Uploaded this session:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sessionFiles.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 p-2 bg-[#F5F6F6] rounded-xl border border-[#E4E7E7]"
                      >
                        {item.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.previewUrl}
                            alt={item.fileName}
                            className="h-9 w-9 object-cover rounded-md shrink-0 border border-[#E4E7E7]"
                          />
                        ) : (
                          <div className="h-9 w-9 bg-white rounded-md flex items-center justify-center shrink-0 border border-[#E4E7E7] text-muted-foreground">
                            <FileText className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[#0A0A0A] truncate">
                            {item.fileName}
                          </p>
                          <p className="text-[11px] text-[#6B7272]">{item.sizeFormatted}</p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-[#00A57E] shrink-0 mr-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
