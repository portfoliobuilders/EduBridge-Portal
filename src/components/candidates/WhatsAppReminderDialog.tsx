'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatAED } from '@/lib/money'
import { formatPhoneNumber, cleanPhoneForWhatsApp } from '@/lib/phone'
import { MessageCircle, ExternalLink, CheckCircle2, ArrowRight } from 'lucide-react'
import type { StudentDirectoryRow } from '@/types/database'

interface WhatsAppReminderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: StudentDirectoryRow[]
}

export function WhatsAppReminderDialog({
  open,
  onOpenChange,
  candidates,
}: WhatsAppReminderDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({})

  const activeCandidate = candidates[currentIndex]

  const buildWhatsAppLink = (c: StudentDirectoryRow) => {
    const rawPhone = cleanPhoneForWhatsApp(c.whatsapp || c.mobile)
    const balanceStr = formatAED(c.total_balance || 0)
    const candidateName = c.full_name || 'Candidate'
    const text = encodeURIComponent(
      `Dear ${candidateName}, this is a gentle reminder from EduBridge Education regarding your enrollment fee balance of ${balanceStr}. Please feel free to contact us if you have any questions. Keep your receipt vouchers for future references.`
    )
    return `https://wa.me/${rawPhone}?text=${text}`
  }

  const handleOpenActive = () => {
    if (!activeCandidate || !activeCandidate.id) return
    const candidateId = activeCandidate.id
    const link = buildWhatsAppLink(activeCandidate)
    window.open(link, '_blank', 'noopener,noreferrer')
    setSentMap((prev) => ({ ...prev, [candidateId]: true }))
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handleOpenSingle = (c: StudentDirectoryRow, idx: number) => {
    if (!c.id) return
    const candidateId = c.id
    const link = buildWhatsAppLink(c)
    window.open(link, '_blank', 'noopener,noreferrer')
    setSentMap((prev) => ({ ...prev, [candidateId]: true }))
    setCurrentIndex(idx)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full bg-white rounded-[14px] border-[#E4E7E7] p-6 shadow-xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E6F6F2] flex items-center justify-center text-[#00A57E]">
              <MessageCircle className="w-4 h-4" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#0A0A0A]">
              Send WhatsApp Reminders
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#6B7272]">
            Review recipients and open individual pre-filled WhatsApp chats sequentially. No automated bulk messages are sent.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {candidates.map((c, idx) => {
            const candidateId = c.id || String(idx)
            const isDone = !!sentMap[candidateId]
            const isCurrent = idx === currentIndex

            return (
              <div
                key={candidateId}
                className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all ${
                  isCurrent
                    ? 'border-[#00A57E] bg-[#E6F6F2]/30'
                    : isDone
                    ? 'border-[#E4E7E7] bg-[#F5F6F6]/40 opacity-75'
                    : 'border-[#E4E7E7] bg-white'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs text-[#0A0A0A] truncate">
                      {c.full_name}
                    </span>
                    {isDone && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00A57E] shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#6B7272] mt-0.5">
                    <span>{formatPhoneNumber(c.mobile)}</span>
                    <span>•</span>
                    <span className="font-semibold text-[#0A0A0A] tabular-nums">
                      Due: {formatAED(c.total_balance || 0)}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant={isCurrent ? 'default' : 'outline'}
                  onClick={() => handleOpenSingle(c, idx)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold ${
                    isCurrent
                      ? 'bg-[#00A57E] hover:bg-[#00805F] text-white'
                      : 'border-[#E4E7E7] text-[#0A0A0A]'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Chat
                </Button>
              </div>
            )
          })}
        </div>

        <DialogFooter className="mt-6 flex items-center justify-between gap-2 border-t border-[#E4E7E7] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-[#E4E7E7] text-xs h-10 px-4"
          >
            Close
          </Button>

          {activeCandidate && (
            <Button
              type="button"
              onClick={handleOpenActive}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl text-xs font-semibold h-10 px-4 flex items-center gap-1.5 shadow-sm"
            >
              <span>
                Chat with {(activeCandidate.full_name || 'Candidate').split(' ')[0]} ({currentIndex + 1}/{candidates.length})
              </span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
