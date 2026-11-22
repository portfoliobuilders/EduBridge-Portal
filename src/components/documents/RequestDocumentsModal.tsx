'use client'

import React, { useState } from 'react'
import {
  X,
  Link as LinkIcon,
  Copy,
  Check,
  MessageSquare,
  Mail,
  Smartphone,
  Loader2,
  Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  createDocumentUploadLinkAction,
  revokeDocumentUploadLinkAction,
} from '@/app/(app)/candidates/[id]/documents-actions'
import { formatDubaiDateTime } from '@/lib/date'

export interface DocTypeOption {
  id: string
  name: string
  slug: string
}

export interface UploadLinkItem {
  id: string
  token: string
  expires_at: string
  revoked_at: string | null
  upload_count: number
  created_at: string
}

interface RequestDocumentsModalProps {
  studentId: string
  studentName: string
  studentPhone: string
  studentEmail?: string | null
  guardianPhone?: string | null
  documentTypes: DocTypeOption[]
  existingLinks: UploadLinkItem[]
  isOpen: boolean
  onClose: () => void
  onLinkCreated: () => void
  whatsappTemplate?: string | null
}

export function RequestDocumentsModal({
  studentId,
  studentName,
  studentPhone,
  studentEmail,
  guardianPhone,
  documentTypes,
  existingLinks,
  isOpen,
  onClose,
  onLinkCreated,
  whatsappTemplate,
}: RequestDocumentsModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    documentTypes.map((t) => t.id)
  )
  const [expiryDays, setExpiryDays] = useState<number>(7)
  const [isPending, setIsPending] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<{
    linkId: string
    token: string
    url: string
    expiresAt: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [recipientChoice, setRecipientChoice] = useState<'candidate' | 'guardian'>(
    'candidate'
  )

  if (!isOpen) return null

  const targetPhone = recipientChoice === 'guardian' && guardianPhone ? guardianPhone : studentPhone

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTypes(documentTypes.map((t) => t.id))
    } else {
      setSelectedTypes([])
    }
  }

  const handleToggleType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const handleGenerateLink = async () => {
    if (selectedTypes.length === 0) {
      toast.error('Please select at least one document type to request')
      return
    }

    setIsPending(true)
    const res = await createDocumentUploadLinkAction({
      studentId,
      requestedTypes: selectedTypes,
      expiryDays,
    })
    setIsPending(false)

    if (res.success && res.data) {
      setGeneratedLink(res.data)
      toast.success('Document upload link generated!')
      onLinkCreated()
    } else {
      toast.error(res.error || 'Failed to create upload link')
    }
  }

  const handleCopyLink = () => {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink.url)
    setCopied(true)
    toast.success('Upload link copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this upload link? The candidate will no longer be able to use it.')) {
      return
    }
    const res = await revokeDocumentUploadLinkAction({ linkId })
    if (res.success) {
      toast.success('Upload link revoked')
      if (generatedLink?.linkId === linkId) {
        setGeneratedLink(null)
      }
      onLinkCreated()
    } else {
      toast.error(res.error || 'Failed to revoke link')
    }
  }

  const expiryFormatted = generatedLink
    ? new Date(generatedLink.expiresAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : `${expiryDays} days`

  const defaultMsg =
    whatsappTemplate ||
    'Dear {student_name}, please upload your documents for EduBridge Education using this secure link (valid until {expiry}): {upload_link}'

  const messageText = defaultMsg
    .replace(/{student_name}/g, studentName)
    .replace(/{expiry}/g, expiryFormatted)
    .replace(/{upload_link}/g, generatedLink?.url || '')

  const handleShareWhatsApp = () => {
    if (!generatedLink) return
    const cleanPhone = targetPhone.replace(/[^\d+]/g, '')
    const url = `https://wa.me/${cleanPhone.replace(/^\+/, '')}?text=${encodeURIComponent(messageText)}`
    window.open(url, '_blank')
  }

  const handleShareSMS = () => {
    if (!generatedLink) return
    const cleanPhone = targetPhone.replace(/[^\d+]/g, '')
    const url = `sms:${cleanPhone}?body=${encodeURIComponent(messageText)}`
    window.open(url, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 space-y-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E7E7]">
          <div>
            <h2 className="text-lg font-bold text-[#0A0A0A] flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-[#00A57E]" />
              Request Candidate Documents
            </h2>
            <p className="text-xs text-[#6B7272] mt-0.5">
              Generate a secure self-upload link for {studentName} (no candidate login required).
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!generatedLink ? (
          /* Step 1: Configuration */
          <div className="space-y-5">
            {/* Document Types Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#0A0A0A]">
                  Select Requested Document Types:
                </label>
                <button
                  type="button"
                  onClick={() => handleSelectAll(selectedTypes.length !== documentTypes.length)}
                  className="text-xs text-[#00A57E] hover:underline font-medium"
                >
                  {selectedTypes.length === documentTypes.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto p-1 border border-[#E4E7E7] rounded-xl">
                {documentTypes.map((type) => {
                  const isChecked = selectedTypes.includes(type.id)
                  return (
                    <label
                      key={type.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'border-[#00A57E] bg-[#E6F6F2]/50 text-[#0A0A0A]'
                          : 'border-transparent hover:bg-[#F5F6F6] text-[#6B7272]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleType(type.id)}
                        className="rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E]"
                      />
                      <span className="font-medium flex-1">{type.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Expiry Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#0A0A0A] block">
                Link Expiry Window:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { days: 3, label: '3 Days' },
                  { days: 7, label: '7 Days (Default)' },
                  { days: 14, label: '14 Days' },
                ].map((item) => (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => setExpiryDays(item.days)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition text-center ${
                      expiryDays === item.days
                        ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                        : 'border-[#E4E7E7] bg-white text-[#6B7272] hover:bg-[#F5F6F6]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Selection (Candidate vs Guardian) */}
            {guardianPhone && (
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-[#0A0A0A] block">
                  Send To:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientChoice('candidate')}
                    className={`p-2 rounded-xl border text-xs font-medium text-left ${
                      recipientChoice === 'candidate'
                        ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F]'
                        : 'border-[#E4E7E7] text-[#6B7272]'
                    }`}
                  >
                    <div>Candidate: {studentName}</div>
                    <div className="text-[11px] opacity-75">{studentPhone}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientChoice('guardian')}
                    className={`p-2 rounded-xl border text-xs font-medium text-left ${
                      recipientChoice === 'guardian'
                        ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F]'
                        : 'border-[#E4E7E7] text-[#6B7272]'
                    }`}
                  >
                    <div>Guardian</div>
                    <div className="text-[11px] opacity-75">{guardianPhone}</div>
                  </button>
                </div>
              </div>
            )}

            {/* Generate Action Button */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleGenerateLink}
                disabled={isPending || selectedTypes.length === 0}
                className="w-full bg-[#00A57E] hover:bg-[#00805F] text-white font-semibold h-11 rounded-xl text-xs gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Secure Link...
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4" />
                    Generate Upload Link
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Step 2: Link Generated & Share Options */
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Generated Link Display */}
            <div className="p-3.5 bg-[#F5F6F6] rounded-xl border border-[#E4E7E7] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#6B7272]">
                <span className="font-medium">Secure Link (Valid until {expiryFormatted}):</span>
                <span className="text-[11px] text-[#00A57E] font-semibold">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink.url}
                  className="flex-1 text-xs font-mono bg-white p-2.5 rounded-lg border border-[#E4E7E7] select-all focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="border-[#E4E7E7] h-9 gap-1 text-xs shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#00A57E]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Direct Send Buttons */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#0A0A0A] block">
                Share Link Instantly:
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="bg-[#25D366] hover:bg-[#20BA5A] text-white h-11 rounded-xl text-xs font-semibold gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>WhatsApp</span>
                </Button>

                <Button
                  type="button"
                  onClick={handleShareSMS}
                  variant="outline"
                  className="border-[#E4E7E7] h-11 rounded-xl text-xs font-semibold gap-2"
                >
                  <Smartphone className="h-4 w-4 text-[#00A57E]" />
                  <span>SMS</span>
                </Button>

                {studentEmail && (
                  <Button
                    type="button"
                    onClick={() => {
                      const mailto = `mailto:${encodeURIComponent(studentEmail)}?subject=${encodeURIComponent(`Document Upload Request — ${studentName}`)}&body=${encodeURIComponent(messageText)}`
                      window.open(mailto, '_blank')
                    }}
                    variant="outline"
                    className="border-[#E4E7E7] h-11 rounded-xl text-xs font-semibold gap-2 col-span-2"
                  >
                    <Mail className="h-4 w-4 text-[#00A57E]" />
                    <span>Email to {studentEmail}</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Message Preview */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Message Preview:
              </span>
              <div className="text-xs text-[#0A0A0A] bg-white p-3 rounded-xl border border-[#E4E7E7] whitespace-pre-wrap leading-relaxed font-sans">
                {messageText}
              </div>
            </div>

            {/* Create Another or Done */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E4E7E7]">
              <button
                type="button"
                onClick={() => setGeneratedLink(null)}
                className="text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                ← Create another link
              </button>
              <Button
                type="button"
                onClick={onClose}
                className="bg-[#00A57E] hover:bg-[#00805F] text-white text-xs h-9 px-4 rounded-xl font-semibold"
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Existing Links List */}
        {existingLinks.length > 0 && !generatedLink && (
          <div className="space-y-2.5 pt-2 border-t border-[#E4E7E7]">
            <span className="text-xs font-semibold text-[#0A0A0A] block">
              Previous Upload Links:
            </span>
            <div className="divide-y divide-[#E4E7E7] max-h-40 overflow-y-auto border border-[#E4E7E7] rounded-xl">
              {existingLinks.map((link) => {
                const isRevoked = !!link.revoked_at
                const isExpired = new Date(link.expires_at) <= new Date()
                const isActive = !isRevoked && !isExpired

                return (
                  <div key={link.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-[#0A0A0A]">
                          ...{link.token.slice(-8)}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-semibold text-[#00A57E] bg-[#E6F6F2] px-2 py-0.5 rounded-full">
                            Active ({link.upload_count} uploaded)
                          </span>
                        )}
                        {isRevoked && (
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            Revoked
                          </span>
                        )}
                        {!isRevoked && isExpired && (
                          <span className="text-[10px] font-semibold text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6B7272] mt-0.5">
                        Expires: {formatDubaiDateTime(link.expires_at)}
                      </div>
                    </div>

                    {isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(link.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 text-[11px] h-7 px-2"
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
