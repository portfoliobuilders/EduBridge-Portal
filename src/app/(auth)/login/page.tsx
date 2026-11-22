'use client'

import React, { useActionState, useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useSearchParams, useRouter } from 'next/navigation'
import { loginAction, requestPasswordResetAction } from './actions'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Receipt,
  FileSpreadsheet,
  Share2,
} from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reason = searchParams.get('reason')
  const redirectedFrom = searchParams.get('redirectedFrom') || '/'

  const [state, formAction, isPending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetPending, setResetPending] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  // Detect Supabase implicit hash tokens from invite/recovery emails
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')

      if (accessToken) {
        const supabase = createClient()
        supabase.auth
          .setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          })
          .then(({ error }) => {
            if (!error) {
              if (type === 'invite' || type === 'recovery') {
                router.replace('/reset-password')
              } else {
                router.replace('/')
              }
            }
          })
      }
    }
  }, [router])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetPending(true)
    try {
      const res = await requestPasswordResetAction(resetEmail)
      if (res?.error) {
        toast.error(res.error)
      } else {
        toast.success('Password reset instructions sent to your email.')
        setResetOpen(false)
        setResetEmail('')
      }
    } catch {
      toast.error('Failed to send reset email. Please try again.')
    } finally {
      setResetPending(false)
    }
  }

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Centered card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E4E7E7] shadow-xs">
        {/* Colour logo (height 36px) above "Sign in" */}
        <div className="mb-5 flex justify-start">
          <Image
            src="/brand/edubridge-logo-color.svg"
            alt="EduBridge Portal"
            width={140}
            height={36}
            priority
            style={{ width: 'auto', height: '36px' }}
            className="h-9 w-auto max-w-[140px] object-contain"
          />
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-[#0A0A0A] font-display tracking-tight">
            Sign in
          </h2>
          <p className="text-xs sm:text-sm text-[#6B7272] mt-1">
            Enter your staff credentials to access the portal
          </p>
        </div>

        {/* Reason notice */}
        {reason === 'inactive' && (
          <div className="mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your account is currently inactive. Please contact the administrator.</span>
          </div>
        )}

        {/* Error notice */}
        {state?.error && (
          <div className="mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectedFrom" value={redirectedFrom} />

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-[#0A0A0A]">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#6B7272] absolute left-3 top-3 pointer-events-none" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@edubridgeeducation.com"
                className="pl-9 text-sm rounded-xl h-10 border-[#E4E7E7] focus-visible:ring-[#00A57E]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-[#0A0A0A]">
                Password
              </Label>
              <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogTrigger className="text-xs text-[#00A57E] hover:underline font-medium">
                  Forgot password?
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                    <DialogDescription>
                      Enter your email address and we will send you a link to reset your password.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleResetPassword} className="space-y-4 mt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-xs">
                        Work Email
                      </Label>
                      <Input
                        id="reset-email"
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="staff@edubridgeeducation.com"
                        className="rounded-xl"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resetPending}
                      className="w-full min-h-[44px] h-11 bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {resetPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        'Send Reset Link'
                      )}
                    </button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="relative">
              <Lock className="w-4 h-4 text-[#6B7272] absolute left-3 top-3 pointer-events-none" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="pl-9 pr-10 text-sm rounded-xl h-10 border-[#E4E7E7] focus-visible:ring-[#00A57E]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-2.5 text-[#6B7272] hover:text-[#0A0A0A] p-0.5 rounded cursor-pointer transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full min-h-[44px] h-11 bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl font-medium text-sm mt-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed shadow-xs"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Below the card: Staff access only + Need help */}
      <div className="mt-6 text-center space-y-1">
        <p className="text-xs font-semibold text-[#0A0A0A]">
          Staff access only
        </p>
        <p className="text-[11px] text-[#6B7272]">
          Need help? Contact your administrator
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen lg:h-[100dvh] lg:max-h-[100dvh] w-full flex flex-col lg:grid lg:grid-cols-[45%_55%] bg-white sm:bg-[#F5F6F6] lg:overflow-hidden">
      {/* 1. Desktop Left Hero Panel (>=1024: 45% solid #00A57E) */}
      <div className="hidden lg:flex flex-col justify-between bg-[#00A57E] text-white p-12 relative overflow-hidden h-full select-none">
        {/* Decorative subtle curved shapes (no images) */}
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-white/[0.04] pointer-events-none" />
        <div className="absolute top-1/4 -right-12 w-64 h-64 rounded-full bg-white/[0.03] pointer-events-none" />

        {/* Top-left white logo (max-width 220px, 48px padding already in p-12) */}
        <div className="shrink-0 z-10">
          <Image
            src="/brand/edubridge-logo-white.svg"
            alt="EduBridge Portal"
            width={220}
            height={50}
            priority
            style={{ width: 'auto', height: 'auto', maxWidth: '220px' }}
            className="max-w-[220px] w-auto h-auto object-contain"
          />
        </div>

        {/* Vertically centred headline, 2-line subtext, 3 feature bullets */}
        <div className="my-auto py-4 space-y-6 max-w-md z-10">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 rounded-full text-xs font-semibold uppercase tracking-wider text-white">
              Admissions &amp; Billing
            </span>
            <h1 className="text-[clamp(32px,2.8vw,48px)] font-semibold leading-[1.15] font-display text-white">
              EduBridge Portal
            </h1>
            <p className="text-white/85 text-sm leading-relaxed line-clamp-2">
              Admissions, billing &amp; team — in one place
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3 text-sm text-white/95">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 shrink-0">
                <Receipt className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Gapless receipts</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-white/95">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Live candidate ledgers</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-white/95">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 shrink-0">
                <Share2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Share via WhatsApp &amp; email</span>
            </div>
          </div>
        </div>

        {/* Footer row */}
        <div className="shrink-0 flex items-center justify-between text-xs text-white/75 border-t border-white/20 pt-4 z-10">
          <span>EduBridge Education · Dubai, UAE</span>
          <span>TRN: 105215478600003</span>
        </div>
      </div>

      {/* 2. Tablet Compact Green Header Band (640-1023) */}
      <div className="hidden sm:flex lg:hidden bg-[#00A57E] text-white px-8 py-5 items-center justify-between shadow-xs shrink-0">
        <div className="flex items-center gap-6">
          <Image
            src="/brand/edubridge-logo-white.svg"
            alt="EduBridge Portal"
            width={160}
            height={38}
            priority
            style={{ width: 'auto', height: 'auto', maxWidth: '160px' }}
            className="max-w-[160px] w-auto h-auto object-contain"
          />
          <div className="border-l border-white/25 pl-6 hidden md:block">
            <h2 className="text-sm font-semibold font-display text-white">
              EduBridge Portal
            </h2>
            <p className="text-[11px] text-white/80">
              Admissions, billing &amp; team — in one place
            </p>
          </div>
        </div>
        <div className="text-xs text-white/80 font-mono">
          TRN: 105215478600003
        </div>
      </div>

      {/* 3. Right Panel (55% desktop, centered single-col on tablet/mobile) */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-8 lg:px-12 py-8 sm:py-12 bg-white sm:bg-[#F5F6F6] lg:h-full lg:overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8 text-sm text-[#6B7272] gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#00A57E]" />
              Loading...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
