'use client'

import React, { useState } from 'react'
import {
  Share2,
  MessageSquare,
  Mail,
  Download,
  Printer,
  Copy,
  Smartphone,
  Link as LinkIcon,
  RotateCw,
  EyeOff,
  Eye,
  Loader2,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { formatAED } from '@/lib/money'
import { SendEmailModal } from '@/components/share/SendEmailModal'
import { logShareAction } from '@/app/(app)/receipts/actions'
import {
  rotateStatementShareTokenAction,
  toggleStatementShareEnabledAction,
  sendStatementEmailAction,
} from '@/app/(app)/candidates/actions'

interface StatementShareActionsProps {
  enrollment: {
    id: string
    share_token?: string | null
    share_enabled?: boolean | null
    total_fee: number
    discount: number
  }
  student: {
    id: string
    full_name: string
    student_code: string
    mobile: string
    whatsapp?: string | null
    email?: string | null
    guardian_name?: string | null
    guardian_email?: string | null
    guardian_phone?: string | null
    guardian_whatsapp?: string | null
  }
  ledger: {
    total_payable?: number
    net_fee?: number
    total_paid: number
    balance: number
  }
  settings?: {
    name?: string
    whatsapp_statement_template?: string | null
  } | null
  appUrl: string
  isOwner?: boolean
}

export function StatementShareActions({
  enrollment,
  student,
  ledger,
  settings,
  appUrl,
}: StatementShareActionsProps) {
  const [shareToken, setShareToken] = useState(
    enrollment.share_token || enrollment.id
  )
  const [shareEnabled, setShareEnabled] = useState(
    enrollment.share_enabled ?? true
  )
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [sharingFile, setSharingFile] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicLink = `${appUrl}/r/statement/${shareToken}`

  // 1. Web Share API Level 2 (PDF File share on phones)
  const handleWebShare = async () => {
    setSharingFile(true)
    try {
      const pdfUrl = `/api/statements/${enrollment.id}/pdf`
      const res = await fetch(pdfUrl)
      if (!res.ok) throw new Error('Could not fetch statement PDF')

      const blob = await res.blob()
      const fileName = `Statement-${student.student_code}.pdf`
      const file = new File([blob], fileName, { type: 'application/pdf' })

      const shareData = {
        title: `Fee Statement - ${student.full_name}`,
        text: `Fee Statement for Candidate ${student.full_name} from EduBridge Education. Balance Due: ${formatAED(ledger.balance)}`,
        files: [file],
      }

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(shareData)
        await logShareAction({
          enrollmentId: enrollment.id,
          channel: 'web_share',
          recipient: student.full_name,
          meta: { method: 'file_share', format: 'pdf' },
        })
        toast.success('Fee statement shared successfully')
        return
      }

      // Fallback: Share link if standard share is supported
      if (navigator.share) {
        await navigator.share({
          title: `Fee Statement - ${student.full_name}`,
          text: `Fee Statement for Candidate ${student.full_name}. Balance Due: ${formatAED(ledger.balance)}`,
          url: publicLink,
        })
        await logShareAction({
          enrollmentId: enrollment.id,
          channel: 'web_share',
          recipient: student.full_name,
          meta: { method: 'url_share' },
        })
        toast.success('Fee statement link shared')
        return
      }

      // Final fallback: copy public link
      await navigator.clipboard.writeText(publicLink)
      await logShareAction({
        enrollmentId: enrollment.id,
        channel: 'link_copy',
      })
      toast.success('Fee statement link copied to clipboard')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      await navigator.clipboard.writeText(publicLink)
      toast.info('Fee statement link copied to clipboard')
    } finally {
      setSharingFile(false)
    }
  }

  // 2. WhatsApp button (target candidate or guardian)
  const handleWhatsAppShare = async (target: 'candidate' | 'guardian' = 'candidate') => {
    const rawTemplate =
      settings?.whatsapp_statement_template ||
      'Dear {student_name}, your balance due with EduBridge Education is AED {balance}. Statement: {public_link}'

    const message = rawTemplate
      .replace('{student_name}', student.full_name)
      .replace('{balance}', formatAED(ledger.balance))
      .replace('{public_link}', publicLink)

    let rawPhone = student.whatsapp || student.mobile
    if (target === 'guardian') {
      rawPhone = student.guardian_whatsapp || student.guardian_phone || rawPhone
    }
    const cleanDigits = rawPhone.replace(/\D/g, '')

    const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')

    await logShareAction({
      enrollmentId: enrollment.id,
      channel: 'whatsapp',
      recipient: cleanDigits,
      meta: { target, candidate_code: student.student_code },
    })
  }

  // 3. SMS button
  const handleSmsShare = async () => {
    const cleanDigits = student.mobile.replace(/\D/g, '')
    const message = `Candidate ${student.full_name}: Your EduBridge fee balance is AED ${formatAED(ledger.balance)}. View statement: ${publicLink}`

    const smsUrl = `sms:${cleanDigits}?&body=${encodeURIComponent(message)}`
    window.location.href = smsUrl

    await logShareAction({
      enrollmentId: enrollment.id,
      channel: 'sms',
      recipient: cleanDigits,
    })
  }

  // 4. Copy Link
  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(publicLink)
    setCopied(true)
    toast.success('Statement link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)

    await logShareAction({
      enrollmentId: enrollment.id,
      channel: 'link_copy',
    })
  }

  // 5. Download PDF
  const handleDownloadPdf = async () => {
    const downloadUrl = `/api/statements/${enrollment.id}/pdf?download=1`
    window.open(downloadUrl, '_blank')

    await logShareAction({
      enrollmentId: enrollment.id,
      channel: 'download',
      meta: { candidate_code: student.student_code },
    })
  }

  // 6. Print PDF
  const handlePrint = async () => {
    window.print()

    await logShareAction({
      enrollmentId: enrollment.id,
      channel: 'print',
      meta: { candidate_code: student.student_code },
    })
  }

  // 7. Toggle Link Enabled
  const handleToggleLink = async () => {
    setToggling(true)
    try {
      const nextState = !shareEnabled
      const res = await toggleStatementShareEnabledAction(enrollment.id, nextState)
      if (res.success) {
        setShareEnabled(nextState)
        toast.success(
          nextState
            ? 'Public statement link enabled'
            : 'Public statement link disabled (now returns 404)'
        )
      } else {
        toast.error(res.error || 'Failed to update statement link state')
      }
    } finally {
      setToggling(false)
    }
  }

  // 8. Regenerate Link Token
  const handleRegenerateToken = async () => {
    const confirmed = window.confirm(
      'Regenerating the statement link will immediately invalidate any previously shared URLs. Continue?'
    )
    if (!confirmed) return

    setRotating(true)
    try {
      const res = await rotateStatementShareTokenAction(enrollment.id)
      if (res.success && res.data?.newToken) {
        setShareToken(res.data.newToken)
        toast.success('New statement link generated. Old links are now invalid (404).')
      } else {
        toast.error(res.error || 'Failed to regenerate statement link')
      }
    } finally {
      setRotating(false)
    }
  }

  const hasGuardianPhone = Boolean(
    student.guardian_whatsapp || student.guardian_phone
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary Share Button */}
        <Button
          onClick={handleWebShare}
          disabled={sharingFile}
          className="bg-[#00A57E] hover:bg-[#00805F] text-white font-semibold text-xs min-h-[44px] px-3.5 shadow-xs flex items-center gap-1.5"
        >
          {sharingFile ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          <span>Share Statement</span>
        </Button>

        {/* WhatsApp Button (with Guardian option if present) */}
        {hasGuardianPhone ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="border-[#E4E7E7] hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-xs min-h-[44px] px-3"
                  title="Send statement via WhatsApp"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-600 mr-1.5" />
                  <span>WhatsApp</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 text-xs">
              <DropdownMenuItem
                onClick={() => handleWhatsAppShare('candidate')}
                className="cursor-pointer"
              >
                <span>Candidate ({student.whatsapp || student.mobile})</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleWhatsAppShare('guardian')}
                className="cursor-pointer"
              >
                <span>
                  Guardian {student.guardian_name ? `(${student.guardian_name})` : ''}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            onClick={() => handleWhatsAppShare('candidate')}
            className="border-[#E4E7E7] hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-xs min-h-[44px] px-3"
            title="Send to Candidate WhatsApp"
          >
            <MessageSquare className="h-4 w-4 text-emerald-600 mr-1.5" />
            <span>WhatsApp</span>
          </Button>
        )}

        {/* Email Button */}
        <Button
          variant="outline"
          onClick={() => setEmailModalOpen(true)}
          className="border-[#E4E7E7] hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-xs min-h-[44px] px-3"
          title="Send fee statement email with PDF attachment"
        >
          <Mail className="h-4 w-4 text-blue-600 mr-1.5" />
          <span>Email</span>
        </Button>

        {/* Download PDF Button */}
        <Button
          variant="outline"
          onClick={handleDownloadPdf}
          className="border-[#E4E7E7] text-xs min-h-[44px] px-3"
          title="Download statement PDF"
        >
          <Download className="h-4 w-4 text-[#00A57E] mr-1.5" />
          <span className="hidden sm:inline">Download</span>
        </Button>

        {/* More Options Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="border-[#E4E7E7] text-xs min-h-[44px] px-2.5"
                title="More statement sharing options"
              >
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">More options</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Statement Options
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
              {copied ? (
                <Check className="h-4 w-4 mr-2 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4 mr-2 text-muted-foreground" />
              )}
              <span>{copied ? 'Link Copied!' : 'Copy Statement Link'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePrint} className="cursor-pointer">
              <Printer className="h-4 w-4 mr-2 text-muted-foreground" />
              <span>Print Statement</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSmsShare} className="cursor-pointer">
              <Smartphone className="h-4 w-4 mr-2 text-muted-foreground" />
              <span>Send via SMS</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Public Link Security</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  shareEnabled
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {shareEnabled ? 'Active' : 'Disabled'}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={handleToggleLink}
              disabled={toggling}
              className="cursor-pointer"
            >
              {shareEnabled ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2 text-amber-600" />
                  <span>Disable Statement Link</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2 text-emerald-600" />
                  <span>Enable Statement Link</span>
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleRegenerateToken}
              disabled={rotating}
              className="cursor-pointer text-red-600 focus:text-red-700"
            >
              <RotateCw className="h-4 w-4 mr-2" />
              <span>Regenerate Link (Rotate)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Email Modal */}
      <SendEmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title="Email Candidate Fee Statement"
        description="Send verified PDF statement to candidate or guardian"
        defaultEmail={student.email}
        guardianEmail={student.guardian_email}
        candidateName={student.full_name}
        guardianName={student.guardian_name}
        onSend={async (targetEmail) => {
          return await sendStatementEmailAction({
            enrollmentId: enrollment.id,
            recipientEmail: targetEmail,
          })
        }}
      />
    </>
  )
}
