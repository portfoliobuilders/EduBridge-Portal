'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

export async function resetPasswordAction(
  prevState: { error?: string; fieldErrors?: Record<string, string[]> } | null,
  formData: FormData
) {
  const raw = {
    password: formData.get('password') as string,
    confirm: formData.get('confirm') as string,
  }

  const result = resetPasswordSchema.safeParse(raw)
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors as Record<string, string[]>
    return {
      error: 'Please fix the errors below.',
      fieldErrors,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: result.data.password })

  if (error) {
    return { error: error.message }
  }

  redirect('/')
}
