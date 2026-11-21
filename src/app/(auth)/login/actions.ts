'use server'

import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

export async function loginAction(prevState: { error?: string } | null, formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }
  const redirectedFrom = (formData.get('redirectedFrom') as string) || '/'

  const result = loginSchema.safeParse(raw)
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    const firstError = Object.values(errors).flat()[0]
    return { error: firstError ?? 'Invalid input.' }
  }

  const { email, password } = result.data

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  // Verify profile active state
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .single()

    const profile = data as { is_active: boolean } | null

    if (profile && !profile.is_active) {
      await supabase.auth.signOut()
      return { error: 'Your staff account has been deactivated. Please contact the administrator.' }
    }
  }

  redirect(redirectedFrom.startsWith('/') ? redirectedFrom : '/')
}

export async function requestPasswordResetAction(email: string) {
  if (!email || !email.includes('@')) {
    return { error: 'Please provide a valid email address.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?next=/reset-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
