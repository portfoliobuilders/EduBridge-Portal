'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Gift, Trophy, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { sendCelebrationWishAction, type CelebrationPerson } from './actions'

interface CelebrationBannerProps {
  celebrations: CelebrationPerson[]
}

export function CelebrationBanner({ celebrations }: CelebrationBannerProps) {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(true) // default true to avoid flash
  const [selectedCelebrant, setSelectedCelebrant] = useState<CelebrationPerson | null>(null)
  const [wishModalOpen, setWishModalOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter out self: banner is for colleagues
  const colleagueCelebrations = celebrations.filter((c) => !c.is_self)

  const todayKey = new Date().toISOString().split('T')[0]
  const dismissStorageKey = `edubridge_celebrations_banner_dismissed_${todayKey}`

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return
      try {
        const isDismissed = localStorage.getItem(dismissStorageKey) === 'true'
        setDismissed(isDismissed)
      } catch {
        setDismissed(false)
      }
    })
    return () => {
      active = false
    }
  }, [dismissStorageKey])

  // Excluded paths
  if (
    colleagueCelebrations.length === 0 ||
    dismissed ||
    pathname.startsWith('/receipts') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/u/') ||
    pathname === '/login' ||
    pathname === '/reset-password'
  ) {
    return null
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissStorageKey, 'true')
    } catch {}
    setDismissed(true)
  }

  const handleOpenWishModal = (celebrant: CelebrationPerson) => {
    setSelectedCelebrant(celebrant)
    setMessage(
      celebrant.kind === 'birthday'
        ? `Happy Birthday, ${celebrant.first_name}! Wishing you a great day and year ahead! 🎂🎉`
        : `Happy work anniversary, ${celebrant.first_name}! Congratulations on ${celebrant.years} amazing years with EduBridge! 🏆🌟`
    )
    setError(null)
    setSentSuccess(false)
    setWishModalOpen(true)
  }

  const handleSendWish = async () => {
    if (!selectedCelebrant || !message.trim()) return
    setSending(true)
    setError(null)

    const res = await sendCelebrationWishAction(
      selectedCelebrant.user_id,
      selectedCelebrant.kind,
      message
    )

    setSending(false)
    if (res.success) {
      setSentSuccess(true)
      setTimeout(() => {
        setWishModalOpen(false)
      }, 1200)
    } else {
      setError(res.error || 'Failed to send wish')
    }
  }

  const quickEmojis = ['🎂', '🎉', '🏆', '⭐', '👏', '🌟', '🥂', '💖']

  return (
    <>
      <aside
        data-testid="celebration-banner"
        aria-label="Today's Celebrations"
        className="w-full bg-[#E6F6F2] border-b border-[#CCEDE5] px-4 py-2 text-xs text-[#0A0A0A] flex flex-wrap items-center justify-between gap-3 shadow-2xs transition-all"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex -space-x-1.5 overflow-hidden shrink-0">
            {colleagueCelebrations.slice(0, 3).map((c) => (
              <div
                key={`${c.user_id}-${c.kind}`}
                className="w-6 h-6 rounded-full border-2 border-white bg-[#00A57E] text-white flex items-center justify-center font-bold text-[10px] overflow-hidden shrink-0"
              >
                {c.avatar_url ? (
                  <Image
                    src={c.avatar_url}
                    alt={c.full_name}
                    width={24}
                    height={24}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  c.first_name[0]
                )}
              </div>
            ))}
          </div>

          <div className="truncate">
            {colleagueCelebrations.length === 1 ? (
              <span>
                {colleagueCelebrations[0].kind === 'birthday' ? (
                  <>🎂 It&apos;s <strong>{colleagueCelebrations[0].full_name}</strong>&apos;s birthday today — send your wishes!</>
                ) : (
                  <>🏆 <strong>{colleagueCelebrations[0].full_name}</strong> completes <strong>{colleagueCelebrations[0].years} years</strong> at EduBridge today!</>
                )}
              </span>
            ) : (
              <span>
                🎉 Celebrations today: <strong>{colleagueCelebrations.map((c) => c.first_name).join(', ')}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {colleagueCelebrations.map((c) => (
            <button
              key={`${c.user_id}-${c.kind}`}
              type="button"
              onClick={() => handleOpenWishModal(c)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#00A57E] hover:bg-[#00805F] text-white rounded-lg font-medium text-xs transition-colors shadow-2xs"
            >
              {c.kind === 'birthday' ? <Gift className="w-3.5 h-3.5" /> : <Trophy className="w-3.5 h-3.5" />}
              Wish {c.first_name}
            </button>
          ))}

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-[#6B7272] hover:text-[#0A0A0A] rounded-md transition-colors"
            title="Dismiss for today"
            aria-label="Dismiss celebration banner for today"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Send Wish Modal */}
      <Dialog open={wishModalOpen} onOpenChange={setWishModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-[#0A0A0A]">
              {selectedCelebrant?.kind === 'birthday' ? (
                <>
                  <Gift className="w-5 h-5 text-[#F5C451]" />
                  Send Birthday Wishes to {selectedCelebrant?.first_name}
                </>
              ) : (
                <>
                  <Trophy className="w-5 h-5 text-[#F5C451]" />
                  Congratulate {selectedCelebrant?.first_name}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272]">
              Your wish will appear on {selectedCelebrant?.first_name}&apos;s celebration wall and notify them. Max 280 characters.
            </DialogDescription>
          </DialogHeader>

          {sentSuccess ? (
            <div className="py-8 px-6 text-center space-y-2">
              <div className="w-12 h-12 bg-[#E6F6F2] text-[#00A57E] rounded-full flex items-center justify-center mx-auto text-xl">
                ✨
              </div>
              <p className="font-semibold text-sm text-[#0A0A0A]">Wish sent successfully!</p>
              <p className="text-xs text-[#6B7272]">Thank you for making their day special.</p>
            </div>
          ) : (
            <div className="p-6 space-y-3">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={280}
                rows={4}
                className="resize-none text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
                placeholder="Write your celebratory message..."
              />

              <div className="flex items-center justify-between">
                {/* Emoji quick-insert */}
                <div className="flex items-center gap-1">
                  {quickEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setMessage((prev) => (prev + emoji).slice(0, 280))}
                      className="text-sm p-1 hover:bg-[#F5F6F6] rounded-md transition-colors"
                      title={`Add ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-[#6B7272] tabular-nums">
                  {280 - message.length} left
                </span>
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                  {error}
                </div>
              )}
            </div>
          )}

          {!sentSuccess && (
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWishModalOpen(false)}
                className="rounded-xl border-[#E4E7E7] text-xs h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={sending || !message.trim()}
                onClick={handleSendWish}
                className="rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white font-medium text-xs h-9 px-4"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {sending ? 'Sending...' : 'Send Wish'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
