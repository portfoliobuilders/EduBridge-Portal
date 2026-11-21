import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Ensure next is a safe relative path
      const safePath = next.startsWith('/') ? next : '/'
      return NextResponse.redirect(new URL(safePath, request.url))
    }
  }

  // Invalid or expired link — redirect to login with a reason
  return NextResponse.redirect(new URL('/login?reason=invalid_link', request.url))
}
