import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

// Next.js 16 uses proxy.ts with an exported `proxy` function.
// (middleware.ts / export function middleware is deprecated in Next 16.)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check rate limit on public endpoints (/r/ and /api/public) via Postgres hit_rate_limit
  if (pathname.startsWith('/r/') || pathname.startsWith('/api/public')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: () => {},
          },
        })
        const { data: isLimited } = await supabase.rpc('hit_rate_limit', {
          p_key: ip,
          p_limit: 30,
          p_window_seconds: 60,
        })

        if (isLimited) {
          return NextResponse.json(
            { error: 'Rate limit exceeded: maximum 30 requests per minute.' },
            {
              status: 429,
              headers: {
                'Retry-After': '60',
                'Content-Type': 'application/json',
              },
            }
          )
        }
      } catch (err) {
        console.error('Rate limit check error:', err)
      }
    }

    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Allow public assets and routes that must be accessible without a session
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/brand') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/confirm') ||
    pathname === '/reset-password'
  ) {
    return response
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return response
  }

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/login'

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isLoginPage) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('redirectedFrom', pathname)
      return NextResponse.redirect(redirectUrl)
    }
    return response
  }

  // User is logged in — verify active profile
  const { data } = await supabase
    .from('profiles')
    .select('is_active, role')
    .eq('id', user.id)
    .single()

  const profile = data as { is_active: boolean; role: string } | null

  if (profile && !profile.is_active) {
    // Inactive profile — sign out and redirect with reason
    await supabase.auth.signOut()
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('reason', 'inactive')
    return NextResponse.redirect(redirectUrl)
  }

  // If logged in and browsing /login, redirect to Home
  if (isLoginPage) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.delete('redirectedFrom')
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2)$).*)',
  ],
}
