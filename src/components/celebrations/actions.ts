'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

export interface CelebrationPerson {
  user_id: string
  full_name: string
  first_name: string
  avatar_url?: string | null
  kind: 'birthday' | 'anniversary'
  years?: number | null
  joined_month_year?: string | null
  is_self: boolean
}

export interface CelebrationWishFeedItem {
  id: string
  from_user_id: string
  from_user_name: string
  from_user_avatar?: string | null
  message: string
  created_at: string
  can_delete: boolean
}

export interface UpcomingCelebration {
  user_id: string
  full_name: string
  avatar_url?: string | null
  kind: 'birthday' | 'anniversary'
  celebration_date: string
  days_away: number
  years?: number | null
}

export async function getCelebrationsTodayAction(): Promise<{
  success: boolean
  celebrations: CelebrationPerson[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_celebrations_today')

    if (error) {
      return { success: false, celebrations: [], error: error.message }
    }

    return { success: true, celebrations: (data as CelebrationPerson[]) || [] }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch celebrations'
    return { success: false, celebrations: [], error: message }
  }
}

export async function getCelebrationWishesFeedAction(
  celebrantId: string,
  kind: 'birthday' | 'anniversary',
  year?: number
): Promise<{
  success: boolean
  wishes: CelebrationWishFeedItem[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_celebration_wishes_feed', {
      p_celebrant_id: celebrantId,
      p_kind: kind,
      p_year: year,
    })

    if (error) {
      return { success: false, wishes: [], error: error.message }
    }

    return { success: true, wishes: (data as CelebrationWishFeedItem[]) || [] }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch celebration wishes'
    return { success: false, wishes: [], error: message }
  }
}

export async function sendCelebrationWishAction(
  celebrantId: string,
  kind: 'birthday' | 'anniversary',
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireUser()
    const trimmed = message.trim()
    if (!trimmed || trimmed.length > 280) {
      return { success: false, error: 'Wish message must be between 1 and 280 characters' }
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('send_celebration_wish', {
      p_celebrant_id: celebrantId,
      p_kind: kind,
      p_message: trimmed,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to send celebration wish'
    return { success: false, error: errorMsg }
  }
}

export async function thankCelebrationWishesAction(
  kind: 'birthday' | 'anniversary',
  message?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requireUser()
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('thank_celebration_wishes', {
      p_kind: kind,
      p_message: message || 'Thank you so much for the lovely celebration wishes!',
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true, count: Number(data || 0) }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to thank well-wishers'
    return { success: false, error: errorMsg }
  }
}

export async function getUpcomingCelebrationsThisWeekAction(): Promise<{
  success: boolean
  upcoming: UpcomingCelebration[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      'get_upcoming_celebrations_this_week'
    )

    if (error) {
      return { success: false, upcoming: [], error: error.message }
    }

    return { success: true, upcoming: (data as UpcomingCelebration[]) || [] }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch upcoming celebrations'
    return { success: false, upcoming: [], error: message }
  }
}
