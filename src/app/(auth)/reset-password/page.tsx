'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { resetPasswordAction } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-[#00A57E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#00805F] disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Set new password'}
    </button>
  )
}

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, null)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F6F6] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/edubridge-logo-color.svg"
            alt="EduBridge Education"
            className="h-10 w-auto"
          />
        </div>

        <h1 className="mb-1 text-center text-xl font-semibold text-[#0A0A0A]">
          Set new password
        </h1>
        <p className="mb-6 text-center text-sm text-[#6B7272]">
          Choose a password with at least 8 characters.
        </p>

        {state?.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-[#0A0A0A]"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-[#E4E7E7] px-4 py-3 text-sm text-[#0A0A0A] placeholder-[#6B7272] focus:border-[#00A57E] focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20"
              placeholder="At least 8 characters"
            />
            {state?.fieldErrors?.password && (
              <p className="mt-1 text-xs text-red-600">{state.fieldErrors.password[0]}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="mb-1 block text-sm font-medium text-[#0A0A0A]"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-[#E4E7E7] px-4 py-3 text-sm text-[#0A0A0A] placeholder-[#6B7272] focus:border-[#00A57E] focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20"
              placeholder="Repeat your new password"
            />
            {state?.fieldErrors?.confirm && (
              <p className="mt-1 text-xs text-red-600">{state.fieldErrors.confirm[0]}</p>
            )}
          </div>

          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
