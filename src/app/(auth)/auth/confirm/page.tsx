'use client'

import React, { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { EmailOtpType } from '@supabase/supabase-js'
import { ShieldCheck, ArrowRight, Loader2, AlertCircle } from 'lucide-react'

function ConfirmForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next')

  const isInvite = type === 'invite'
  const isRecovery = type === 'recovery'

  const handleContinue = async () => {
    if (!token_hash || !type) {
      setError('Missing security token or verification type. Please check the link from your email.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash,
      })

      if (verifyError) {
        setError(verifyError.message || 'Invalid or expired link. Please request a new one.')
        setLoading(false)
        return
      }

      // Safe destination redirect
      let dest = '/'
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        dest = next
      } else if (isRecovery || isInvite) {
        dest = '/reset-password'
      }

      router.push(dest)
    } catch {
      setError('An unexpected error occurred during verification. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-[#E4E7E7]">
      {/* Brand Logo */}
      <div className="mb-6 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/edubridge-logo-color.svg"
          alt="EduBridge Education"
          className="h-10 w-auto"
        />
      </div>

      <div className="text-center mb-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F6F2] text-[#00A57E]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-[#0A0A0A]">
          {isInvite ? 'Accept Your Invitation' : isRecovery ? 'Password Reset Verification' : 'Confirm Your Action'}
        </h1>
        <p className="mt-1 text-sm text-[#6B7272]">
          To protect your account against automated link scanners, click the button below to complete verification.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium">Verification Failed</p>
            <p className="mt-0.5 text-xs text-red-600">{error}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#00A57E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#00805F] disabled:opacity-60 shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verifying link…</span>
            </>
          ) : (
            <>
              <span>Continue</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <div className="text-center pt-2">
          <Link
            href="/login"
            className="text-xs text-[#6B7272] hover:text-[#00A57E] transition underline underline-offset-4"
          >
            Return to Login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F6F6] px-4 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center text-sm text-[#6B7272] border border-[#E4E7E7]">
            Loading verification details…
          </div>
        }
      >
        <ConfirmForm />
      </Suspense>
    </div>
  )
}
