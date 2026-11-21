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
import { Lock, Mail, ArrowRight, AlertCircle, Loader2 } from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reason = searchParams.get('reason')
  const redirectedFrom = searchParams.get('redirectedFrom') || '/'

  const [state, formAction, isPending] = useActionState(loginAction, null)

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
    <div className="w-full max-w-sm">
      {/* Mobile Top Brand Header */}
      <div className="md:hidden flex flex-col items-center mb-8 text-center">
        <Image
          src="/brand/edubridge-logo-color.svg"
          alt="EduBridge Education"
          width={190}
          height={48}
          priority
          style={{ width: 'auto', height: 'auto' }}
          className="mb-4"
        />
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          Receipt & Billing System
        </p>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground font-display">
            Sign In
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your staff credentials to access the portal
          </p>
        </div>

        {reason === 'inactive' && (
          <div className="mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your account is currently inactive. Please contact the administrator.</span>
          </div>
        )}

        {state?.error && (
          <div className="mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectedFrom" value={redirectedFrom} />

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-foreground">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@edubridgeeducation.com"
                className="pl-9 text-sm rounded-xl h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-foreground">
                Password
              </Label>
              <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogTrigger className="text-xs text-primary hover:underline font-medium">
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
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="pl-9 text-sm rounded-xl h-10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full min-h-[44px] h-11 bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl font-medium text-sm mt-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed shadow-sm"
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

      <p className="text-center text-xs text-muted-foreground mt-8">
        Staff access only · EduBridge Education (Dubai, UAE)
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#F5F6F6]">
      {/* Desktop Left Brand Hero Panel */}
      <div className="hidden md:flex md:w-1/2 bg-[#00A57E] text-white p-12 xl:p-16 flex-col justify-between relative overflow-hidden">
        <div>
          <Image
            src="/brand/edubridge-logo-white.svg"
            alt="EduBridge Education"
            width={220}
            height={56}
            priority
            style={{ width: 'auto', height: 'auto' }}
          />
        </div>

        <div className="max-w-md my-auto py-12">
          <span className="inline-block px-3 py-1 bg-white/15 rounded-full text-xs font-semibold uppercase tracking-wider mb-6">
            Admissions & Billing
          </span>
          <h1 className="text-4xl xl:text-5xl font-semibold leading-tight font-display mb-4">
            Receipt & Billing Management
          </h1>
          <p className="text-white/80 text-base leading-relaxed">
            Issue gapless official receipt vouchers, track student installment schedules, and generate verified fee statements seamlessly.
          </p>
        </div>

        <div className="text-xs text-white/60 flex items-center justify-between border-t border-white/20 pt-6">
          <span>EduBridge Education · Dubai, UAE</span>
          <span>TRN: 105215478600003</span>
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 sm:px-12 md:px-16">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
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
