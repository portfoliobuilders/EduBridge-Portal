import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

export type Profile = Database['public']['Tables']['profiles']['Row']

export async function getUserProfile(): Promise<{
  user: { id: string; email?: string } | null
  profile: Profile | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
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
}

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

export async function requireOwner(): Promise<{
  user: { id: string; email?: string }
  profile: Profile
}> {
  const { user, profile } = await requireUser()

  if (profile.role !== 'owner') {
    // 404 for non-owners so the existence of admin routes is not disclosed
    notFound()
  }

  return { user, profile }
}
