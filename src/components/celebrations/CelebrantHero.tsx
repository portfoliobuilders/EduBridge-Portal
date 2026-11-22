'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import confetti from 'canvas-confetti'
import { Heart, Sparkles, Trophy, Gift, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getCelebrationWishesFeedAction,
  thankCelebrationWishesAction,
  type CelebrationPerson,
  type CelebrationWishFeedItem,
} from './actions'
import { cn } from '@/lib/utils'

interface CelebrantHeroProps {
  celebration: CelebrationPerson
}

export function CelebrantHero({ celebration }: CelebrantHeroProps) {
  const [wishes, setWishes] = useState<CelebrationWishFeedItem[]>([])
  const [thanked, setThanked] = useState(false)
  const [thanking, setThanking] = useState(false)
  const [loadingWishes, setLoadingWishes] = useState(true)

  const isBirthday = celebration.kind === 'birthday'
  const todayKey = new Date().toISOString().split('T')[0]
  const confettiKey = `edubridge_confetti_shown_${todayKey}`

  // One-time confetti burst on first load of the day
  useEffect(() => {
    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const alreadyShown = localStorage.getItem(confettiKey) === 'true'

      if (!prefersReducedMotion && !alreadyShown) {
        localStorage.setItem(confettiKey, 'true')

        // Fire 2-second confetti burst
        const end = Date.now() + 1800
        const colors = isBirthday ? ['#00A57E', '#F5C451', '#FFFFFF', '#CCEDE5'] : ['#00A57E', '#D4AF37', '#FFFFFF', '#F5C451']

        const frame = () => {
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.7 },
            colors,
            disableForReducedMotion: true,
          })
          confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.7 },
            colors,
            disableForReducedMotion: true,
          })

          if (Date.now() < end) {
            requestAnimationFrame(frame)
          }
        }
        frame()
      }
    } catch (e) {
      console.warn('Could not fire confetti:', e)
    }
  }, [confettiKey, isBirthday])

  // Load wishes feed
  useEffect(() => {
    async function loadWishes() {
      setLoadingWishes(true)
      const res = await getCelebrationWishesFeedAction(celebration.user_id, celebration.kind)
      if (res.success && res.wishes) {
        setWishes(res.wishes)
      }
      setLoadingWishes(false)
    }
    loadWishes()
  }, [celebration.user_id, celebration.kind])

  const handleThankEveryone = async () => {
    setThanking(true)
    const res = await thankCelebrationWishesAction(
      celebration.kind,
      `Thank you so much for the wonderful ${celebration.kind} wishes!`
    )
    setThanking(false)
    if (res.success) {
      setThanked(true)
    }
  }

  return (
    <div
      data-testid="celebrant-hero-card"
      className="w-full rounded-2xl border border-[#CCEDE5] bg-gradient-to-br from-[#E6F6F2] via-white to-[#F5F6F6] p-6 sm:p-8 shadow-xs relative overflow-hidden mb-6"
    >
      {/* Decorative background sparkle */}
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        {isBirthday ? <Gift className="w-48 h-48 text-[#00A57E]" /> : <Trophy className="w-48 h-48 text-[#00A57E]" />}
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
        {/* Left: Avatar + Headline */}
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full ring-4 ring-[#F5C451] ring-offset-4 ring-offset-white bg-[#00A57E] text-white flex items-center justify-center font-bold text-2xl overflow-hidden shadow-md">
              {celebration.avatar_url ? (
                <Image
                  src={celebration.avatar_url}
                  alt={celebration.full_name}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              ) : (
                celebration.first_name[0]
              )}
            </div>
            <span
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-sm border border-[#E4E7E7]"
              title={isBirthday ? 'Birthday' : 'Work Anniversary'}
            >
              {isBirthday ? '🎂' : '🏆'}
            </span>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#00A57E] text-white mb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {isBirthday ? 'Birthday Celebration' : `${celebration.years}-Year Milestone`}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0A0A0A] tracking-tight">
              {isBirthday
                ? `Happy Birthday, ${celebration.first_name}! 🎂`
                : `Happy ${celebration.years}-Year Work Anniversary, ${celebration.first_name}! 🎉`}
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7272] mt-1 max-w-lg">
              {isBirthday
                ? 'The entire EduBridge family wishes you an exceptional day and a brilliant year ahead.'
                : `Joined ${celebration.joined_month_year} · ${celebration.years} year${(celebration.years || 1) > 1 ? 's' : ''} of impact, dedication, and excellence at EduBridge.`}
            </p>
          </div>
        </div>

        {/* Right: Thank Everyone CTA */}
        {wishes.length > 0 && (
          <div className="shrink-0">
            <Button
              onClick={handleThankEveryone}
              disabled={thanked || thanking}
              className={cn(
                'rounded-xl text-xs font-semibold transition-all shadow-xs',
                thanked
                  ? 'bg-white text-[#00A57E] border border-[#00A57E]'
                  : 'bg-[#00A57E] hover:bg-[#00805F] text-white'
              )}
            >
              <Heart className={cn('w-4 h-4 mr-1.5', thanked && 'fill-current text-[#00A57E]')} />
              {thanked ? 'Thank-you note posted! 💖' : thanking ? 'Posting...' : 'Thank everyone'}
            </Button>
          </div>
        )}
      </div>

      {/* Wishes Wall */}
      <div className="mt-6 pt-6 border-t border-[#CCEDE5]/60 relative z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-[#00A57E]" />
            Wishes from colleagues ({wishes.length})
          </h2>
        </div>

        {loadingWishes ? (
          <p className="text-xs text-[#6B7272]">Loading wishes...</p>
        ) : wishes.length === 0 ? (
          <p className="text-xs text-[#6B7272] italic">
            No wishes posted yet. Your team members have been notified!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wishes.map((w) => (
              <div
                key={w.id}
                className="bg-white/90 backdrop-blur-xs p-3.5 rounded-xl border border-[#E4E7E7] shadow-2xs space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#00A57E] text-white text-[10px] font-bold flex items-center justify-center shrink-0 overflow-hidden">
                    {w.from_user_avatar ? (
                      <Image
                        src={w.from_user_avatar}
                        alt={w.from_user_name}
                        width={24}
                        height={24}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      w.from_user_name[0]
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[#0A0A0A] truncate">
                    {w.from_user_name}
                  </span>
                  <span className="text-[10px] text-[#6B7272] ml-auto shrink-0">
                    {new Date(w.created_at).toLocaleTimeString('en-AE', {
                      timeZone: 'Asia/Dubai',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-[#0A0A0A] leading-relaxed break-words">
                  {w.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
