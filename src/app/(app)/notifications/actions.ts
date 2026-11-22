'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

export interface NotificationItem {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  link?: string | null
  entity_type?: string | null
  entity_id?: string | null
  read_at?: string | null
  created_at: string
}

export async function getNotificationsAction(
  filter: 'all' | 'unread' | 'read' | 'celebrations' | 'payments' | 'transfers' = 'all',
  limit: number = 50
): Promise<{ success: boolean; notifications?: NotificationItem[]; error?: string }> {
  try {
    const { user } = await requireUser()
    const supabase = await createClient()

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (filter === 'unread') {
      query = query.is('read_at', null)
    } else if (filter === 'read') {
      query = query.not('read_at', 'is', null)
    } else if (filter === 'celebrations') {
      query = query.like('type', 'celebration%')
    } else if (filter === 'payments') {
      query = query.in('type', ['payment_recorded', 'receipt_voided'])
    } else if (filter === 'transfers') {
      query = query.in('type', ['candidate_transferred', 'transfer_requested'])
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, notifications: (data as NotificationItem[]) || [] }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch notifications'
    return { success: false, error: message }
  }
}

export async function markNotificationReadAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('mark_notification_read', {
      p_id: id,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/notifications')
    return { success: Boolean(data) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to mark notification as read'
    return { success: false, error: message }
  }
}

export async function markAllNotificationsReadAction(): Promise<{
  success: boolean
  count?: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('mark_all_notifications_read')

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/notifications')
    return { success: true, count: Number(data || 0) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to mark all notifications as read'
    return { success: false, error: message }
  }
}

export async function getUnreadNotificationCountAction(): Promise<{
  success: boolean
  count: number
}> {
  try {
    const { user } = await requireUser()
    const supabase = await createClient()

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)

    if (error) {
      return { success: false, count: 0 }
    }

    return { success: true, count: count || 0 }
  } catch {
    return { success: false, count: 0 }
  }
}
