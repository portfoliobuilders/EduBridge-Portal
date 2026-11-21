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
import {
  logShareAction,
  rotateReceiptShareTokenAction,
  toggleReceiptShareEnabledAction,
  sendReceiptEmailAction,
} from '@/app/(app)/receipts/actions'

interface ReceiptShareActionsProps {
  payment: {
    id: string
    receipt_no: string
    amount: number
    balance_after_snapshot: number
    share_token: string
    share_enabled?: boolean
    status: string
    enrollment_id: string
    payee_name?: string | null
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
  settings: {
    name: string
    whatsapp_receipt_template?: string | null
  }
  appUrl: string
  isOwner?: boolean
}

export function ReceiptShareActions({
  payment,
  student,
  settings,
  appUrl,
}: ReceiptShareActionsProps) {
  const [shareToken, setShareToken] = useState(payment.share_token)
  const [shareEnabled, setShareEnabled] = useState(payment.share_enabled ?? true)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [sharingFile, setSharingFile] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicLink = `${appUrl}/r/${shareToken}`

  // 1. Web Share API Level 2 (PDF File share on phones)
  const handleWebShare = async () => {
    setSharingFile(true)
    try {
      const pdfUrl = `/api/receipts/${payment.id}/pdf`
      const res = await fetch(pdfUrl)
      if (!res.ok) throw new Error('Could not fetch PDF for sharing')

      const blob = await res.blob()
      const fileName = `${payment.receipt_no}.pdf`
      const file = new File([blob], fileName, { type: 'application/pdf' })

      const shareData = {
        title: `Receipt Voucher ${payment.receipt_no}`,
        text: `Receipt voucher ${payment.receipt_no} for Candidate ${student.full_name} from EduBridge Education.`,
        files: [file],
      }

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(shareData)
        await logShareAction({
          paymentId: payment.id,
          enrollmentId: payment.enrollment_id,
          channel: 'web_share',
          recipient: student.full_name,
          meta: { method: 'file_share', format: 'pdf' },
        })
        toast.success('Receipt voucher shared successfully')
        return
      }

      // Fallback: Share link if standard share is supported
      if (navigator.share) {
        await navigator.share({
          title: `Receipt Voucher ${payment.receipt_no}`,
          text: `Receipt voucher ${payment.receipt_no} for Candidate ${student.full_name}`,
          url: publicLink,
        })
        await logShareAction({
          paymentId: payment.id,
          enrollmentId: payment.enrollment_id,
          channel: 'web_share',
          recipient: student.full_name,
          meta: { method: 'url_share' },
        })
        toast.success('Receipt link shared')
        return
      }

      // Final fallback: copy public link
      await navigator.clipboard.writeText(publicLink)
      await logShareAction({
        paymentId: payment.id,
        enrollmentId: payment.enrollment_id,
        channel: 'link_copy',
      })
      toast.success('Public link copied to clipboard (file sharing not supported on this browser)')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled share dialog
        return
      }
      // On error, copy link as fallback
      await navigator.clipboard.writeText(publicLink)
      toast.info('Public link copied to clipboard')
    } finally {
      setSharingFile(false)
    }
  }

  // 2. WhatsApp button
  const handleWhatsAppShare = async () => {
    const rawTemplate =
      settings.whatsapp_receipt_template ||
      'Dear {student_name}, thank you for your payment of AED {amount} to EduBridge Education. Receipt No: {receipt_no}. Balance: AED {balance}. View/download: {public_link}'

    const message = rawTemplate
      .replace('{student_name}', payment.payee_name || student.full_name)
      .replace('{amount}', formatAED(payment.amount))
      .replace('{receipt_no}', payment.receipt_no)
      .replace('{balance}', formatAED(payment.balance_after_snapshot))
      .replace('{public_link}', publicLink)

    const rawPhone = student.whatsapp || student.mobile
    const cleanDigits = rawPhone.replace(/\D/g, '')

    const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')

    await logShareAction({
      paymentId: payment.id,
      enrollmentId: payment.enrollment_id,
      channel: 'whatsapp',
      recipient: cleanDigits,
      meta: { receipt_no: payment.receipt_no },
    })
  }

  // 3. SMS button
  const handleSmsShare = async () => {
    const rawPhone = student.mobile
    const cleanDigits = rawPhone.replace(/\D/g, '')
    const message = `Candidate ${student.full_name}: Payment receipt ${payment.receipt_no} for AED ${formatAED(payment.amount)} confirmed. Balance: AED ${formatAED(payment.balance_after_snapshot)}. Link: ${publicLink}`

    const smsUrl = `sms:${cleanDigits}?&body=${encodeURIComponent(message)}`
    window.location.href = smsUrl

    await logShareAction({
      paymentId: payment.id,
      enrollmentId: payment.enrollment_id,
      channel: 'sms',
      recipient: cleanDigits,
    })
  }

  // 4. Copy Link
  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(publicLink)
    setCopied(true)
    toast.success('Public receipt link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)

    await logShareAction({
      paymentId: payment.id,
      enrollmentId: payment.enrollment_id,
      channel: 'link_copy',
    })
  }

  // 5. Download PDF
  const handleDownloadPdf = async () => {
    const downloadUrl = `/api/receipts/${payment.id}/pdf?download=1`
    window.open(downloadUrl, '_blank')

    await logShareAction({
      paymentId: payment.id,
      enrollmentId: payment.enrollment_id,
      channel: 'download',
      meta: { receipt_no: payment.receipt_no },
    })
  }

  // 6. Print PDF
  const handlePrint = async () => {
    window.print()

    await logShareAction({
      paymentId: payment.id,
      enrollmentId: payment.enrollment_id,
      channel: 'print',
      meta: { receipt_no: payment.receipt_no },
    })
  }

  // 7. Toggle Link Enabled
  const handleToggleLink = async () => {
    setToggling(true)
    try {
      const nextState = !shareEnabled
      const res = await toggleReceiptShareEnabledAction(payment.id, nextState)
      if (res.success) {
        setShareEnabled(nextState)
        toast.success(
          nextState
            ? 'Public receipt link enabled'
            : 'Public receipt link disabled (now returns 404)'
        )
      } else {
        toast.error(res.error || 'Failed to update link state')
      }
    } finally {
      setToggling(false)
    }
  }

  // 8. Regenerate Link Token
  const handleRegenerateToken = async () => {
    const confirmed = window.confirm(
      'Regenerating the link will immediately invalidate any previously shared URLs. Continue?'
    )
    if (!confirmed) return

    setRotating(true)
    try {
      const res = await rotateReceiptShareTokenAction(payment.id)
      if (res.success && res.data?.newToken) {
        setShareToken(res.data.newToken)
        toast.success('New public receipt link generated. Old links are now invalid (404).')
      } else {
        toast.error(res.error || 'Failed to regenerate link')
      }
    } finally {
      setRotating(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* 1. Primary Share Button (Mobile-first, Web Share Level 2) */}
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
          <span>Share PDF</span>
        </Button>

        {/* 2. WhatsApp Button */}
        <Button
          variant="outline"
          onClick={handleWhatsAppShare}
          className="border-[#E4E7E7] hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-xs min-h-[44px] px-3"
          title="Send to Candidate WhatsApp"
        >
          <MessageSquare className="h-4 w-4 text-emerald-600 mr-1.5" />
          <span>WhatsApp</span>
        </Button>

        {/* 3. Email Button */}
        <Button
          variant="outline"
          onClick={() => setEmailModalOpen(true)}
          className="border-[#E4E7E7] hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-xs min-h-[44px] px-3"
          title="Send receipt email with PDF attachment"
        >
          <Mail className="h-4 w-4 text-blue-600 mr-1.5" />
          <span>Email</span>
        </Button>

        {/* 4. Download PDF */}
        <Button
          variant="outline"
          onClick={handleDownloadPdf}
          className="border-[#E4E7E7] text-xs min-h-[44px] px-3"
          title="Download official PDF"
        >
          <Download className="h-4 w-4 text-[#00A57E] mr-1.5" />
          <span className="hidden sm:inline">Download</span>
        </Button>

        {/* 5. Print */}
        <Button
          variant="outline"
          onClick={handlePrint}
          className="border-[#E4E7E7] text-xs min-h-[44px] px-3 hidden md:inline-flex"
          title="Print voucher"
        >
          <Printer className="h-4 w-4 text-muted-foreground mr-1.5" />
          <span>Print</span>
        </Button>

        {/* 6. More Actions (Copy link, SMS, Link management) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="border-[#E4E7E7] text-xs min-h-[44px] px-2.5"
                title="More sharing options"
              >
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">More options</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Sharing Options
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
              {copied ? (
                <Check className="h-4 w-4 mr-2 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4 mr-2 text-muted-foreground" />
              )}
              <span>{copied ? 'Link Copied!' : 'Copy Public Link'}</span>
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
                  <span>Disable Public Link</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2 text-emerald-600" />
                  <span>Enable Public Link</span>
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
        title={`Email Receipt ${payment.receipt_no}`}
        description={`Send official PDF receipt voucher to candidate or guardian`}
        defaultEmail={student.email}
        guardianEmail={student.guardian_email}
        candidateName={student.full_name}
        guardianName={student.guardian_name}
        onSend={async (targetEmail) => {
          return await sendReceiptEmailAction({
            paymentId: payment.id,
            recipientEmail: targetEmail,
          })
        }}
      />
    </>
  )
}
