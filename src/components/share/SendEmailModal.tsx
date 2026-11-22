'use client'

import React, { useState } from 'react'
import { Mail, Loader2, Send } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { EmailSendResult } from '@/lib/email/send-email'

interface SendEmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  defaultEmail?: string | null
  guardianEmail?: string | null
  candidateName: string
  guardianName?: string | null
  onSend: (email: string) => Promise<EmailSendResult>
}

function SendEmailForm({
  onClose,
  defaultEmail,
  guardianEmail,
  candidateName,
  guardianName,
  onSend,
}: {
  onClose: () => void
  defaultEmail?: string | null
  guardianEmail?: string | null
  candidateName: string
  guardianName?: string | null
  onSend: (email: string) => Promise<EmailSendResult>
}) {
  const [email, setEmail] = useState(defaultEmail || guardianEmail || '')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error('Please enter a recipient email address')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      toast.error('Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      const res = await onSend(trimmed)
      if (res.fallbackMailto && res.mailtoUrl) {
        toast.info(res.message || 'Attachment unavailable — sending link via email client')
        window.location.href = res.mailtoUrl
        onClose()
      } else if (res.success) {
        toast.success(res.message || 'Email sent successfully with PDF attached!')
        onClose()
      } else {
        toast.error(res.error || 'Failed to send email')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending email'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-4 py-2">
        {/* Quick Select Buttons */}
        {(defaultEmail || guardianEmail) && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Quick Select Recipient</Label>
            <div className="flex flex-wrap gap-2">
              {defaultEmail && (
                <button
                  type="button"
                  onClick={() => setEmail(defaultEmail)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border text-left transition ${email === defaultEmail
                    ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                    : 'border-[#E4E7E7] hover:bg-gray-50 text-gray-700'
                    }`}
                >
                  Candidate ({candidateName}): {defaultEmail}
                </button>
              )}
              {guardianEmail && (
                <button
                  type="button"
                  onClick={() => setEmail(guardianEmail)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border text-left transition ${email === guardianEmail
                    ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F] font-semibold'
                    : 'border-[#E4E7E7] hover:bg-gray-50 text-gray-700'
                    }`}
                >
                  {guardianName ? `${guardianName} (Guardian)` : 'Guardian'}: {guardianEmail}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Email Input */}
        <div className="space-y-1.5">
          <Label htmlFor="recipientEmail" className="text-xs font-medium text-[#0A0A0A]">
            Recipient Email Address
          </Label>
          <Input
            id="recipientEmail"
            type="email"
            placeholder="e.g. candidate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-xs h-10 border-[#E4E7E7]"
            disabled={loading}
          />
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-xs text-muted-foreground space-y-1 border border-gray-100">
          <div>• Branded EduBridge Education template with official letterhead</div>
          <div>• Official PDF document attached</div>
          <div>• Direct link for candidate online verification</div>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSend}
          disabled={loading || !email.trim()}
          className="bg-[#00A57E] hover:bg-[#00805F] text-white"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-1.5" />
              Send Email
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

export function SendEmailModal({
  open,
  onOpenChange,
  title,
  description,
  defaultEmail,
  guardianEmail,
  candidateName,
  guardianName,
  onSend,
}: SendEmailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-emerald-50 text-[#00A57E] flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-[#0A0A0A]">
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open && (
          <SendEmailForm
            key={`${defaultEmail || ''}-${guardianEmail || ''}`}
            onClose={() => onOpenChange(false)}
            defaultEmail={defaultEmail}
            guardianEmail={guardianEmail}
            candidateName={candidateName}
            guardianName={guardianName}
            onSend={onSend}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
