import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : 'https'
    return `${proto}://${forwardedHost.split(',')[0].trim()}`
  }
  const host = request.headers.get('host')
  if (host) {
    const proto = forwardedProto
      ? forwardedProto.split(',')[0].trim()
      : request.nextUrl.protocol.replace(':', '') || 'http'
    return `${proto}://${host}`
  }
  return request.nextUrl.origin
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const origin = getRequestOrigin(request)
  const response = NextResponse.redirect(new URL('/login', origin), { status: 303 })

  // Explicitly clear Supabase auth cookies so sign-out succeeds on localhost, HTTPS tunnels, and production
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
      })
    }
  }

  return response
}
