import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Validates a redirect target path with an origin check.
 * Ensures the target stays on the same origin (no open redirects, schema-relative bypasses, etc.)
 */
function getSafeRedirectPath(next: string | null, requestUrl: string): string {
  try {
    const origin = new URL(requestUrl).origin
    const u = new URL(next ?? '/', origin)
    return u.origin === origin ? u.pathname + u.search : '/'
  } catch {
    return '/'
  }
}

/**
 * Auth callback route handler.
 * Supabase redirects here with ?code=... after:
 *   - Email confirmation
 *   - Password reset (via resetPasswordForEmail with redirectTo pointing here)
 *   - Magic link / OAuth flows
 *
 * After exchanging the code for a session, it redirects to the `next`
 * search param (default: /).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next')

  const safePath = getSafeRedirectPath(next, request.url)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(safePath, request.url))
    }
  }

  const allowedOtpTypes: readonly EmailOtpType[] = [
    'invite',
    'recovery',
    'email',
    'magiclink',
  ]

  if (token_hash && type && (allowedOtpTypes as readonly string[]).includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    })
    if (!error) {
      return NextResponse.redirect(new URL(safePath, request.url))
    }
  }

  // Invalid or expired link — redirect to login with a reason
  return NextResponse.redirect(new URL('/login?reason=invalid_link', request.url))
}
