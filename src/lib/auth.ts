import { cache } from 'react'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type AppRole = Database['public']['Enums']['app_role']

export const getUserProfile = cache(async (): Promise<{
  user: { id: string; email?: string } | null
  profile: Profile | null
}> => {
  const supabase = await createClient()
  let user: { id: string; email?: string } | null = null

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (!claimsError && claimsData?.claims?.sub) {
    user = {
      id: claimsData.claims.sub,
      email: typeof claimsData.claims.email === 'string' ? claimsData.claims.email : undefined,
    }
  } else {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()
    if (!authError && authUser) {
      user = { id: authUser.id, email: authUser.email }
    }
  }

  if (!user) {
    return { user: null, profile: null }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { user, profile: null }
  }

  return { user, profile }
})

export async function requireUser(): Promise<{
  user: { id: string; email?: string }
  profile: Profile
}> {
  const { user, profile } = await getUserProfile()

  if (!user) {
    redirect('/login')
  }

  if (!profile || !profile.is_active) {
    redirect('/login?reason=inactive')
  }

  return { user, profile }
}

export async function requireRole(
  allowedRoles: AppRole | AppRole[]
): Promise<{
  user: { id: string; email?: string }
  profile: Profile
}> {
  const { user, profile } = await requireUser()
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (!roles.includes(profile.role)) {
    // 404 for unauthorized roles so the existence of restricted routes is not disclosed
    notFound()
  }

  return { user, profile }
}

export async function requireSuperAdmin(): Promise<{
  user: { id: string; email?: string }
  profile: Profile
}> {
  return requireRole(['super_admin', 'owner'])
}

export async function requireAdminOrAbove(): Promise<{
  user: { id: string; email?: string }
  profile: Profile
}> {
  return requireRole(['super_admin', 'admin', 'owner'])
}

/**
 * Backward-compatible alias for requireSuperAdmin
 */
export async function requireOwner(): Promise<{
  user: { id: string; email?: string }
  profile: Profile
}> {
  return requireSuperAdmin()
}
