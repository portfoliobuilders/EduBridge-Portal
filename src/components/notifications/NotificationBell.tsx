'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, ExternalLink, Gift, CreditCard, UserCheck, FileText, ArrowRightLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationItem,
} from '@/app/(app)/notifications/actions'
import { cn } from '@/lib/utils'

interface NotificationBellProps {
  userId: string
  className?: string
}

export function NotificationBell({ userId, className }: NotificationBellProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    getNotificationsAction('all', 15).then((res) => {
      if (!active) return
      if (res.success && res.notifications) {
        setNotifications(res.notifications)
        setUnreadCount(res.notifications.filter((n) => !n.read_at).length)
      }
    })

    // Subscribe to live notifications via Supabase Realtime safely
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    try {
      const channelName = `notifications-${userId}-${Math.random().toString(36).slice(2, 7)}`
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            getNotificationsAction('all', 15).then((res) => {
              if (res.success && res.notifications) {
                setNotifications(res.notifications)
                setUnreadCount(res.notifications.filter((n) => !n.read_at).length)
              }
            })
          }
        )
      channel.subscribe()
    } catch (err) {
      console.warn('Realtime subscription error:', err)
    }

    return () => {
      active = false
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [userId])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleMarkAsRead = async (id: string, link?: string | null) => {
    await markNotificationReadAction(id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
    if (link) {
      setIsOpen(false)
      router.push(link)
    }
  }

  const handleMarkAllRead = async () => {
    setLoading(true)
    await markAllNotificationsReadAction()
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
    )
    setUnreadCount(0)
    setLoading(false)
  }

  // Group notifications into Today and Earlier
  const today = new Date().toDateString()
  const todayList = notifications.filter(
    (n) => new Date(n.created_at).toDateString() === today
  )
  const earlierList = notifications.filter(
    (n) => new Date(n.created_at).toDateString() !== today
  )

  const getIconForType = (type: string) => {
    if (type.startsWith('celebration')) {
      return <Gift className="w-4 h-4 text-[#F5C451]" />
    }
    if (type.startsWith('payment') || type.startsWith('receipt')) {
      return <CreditCard className="w-4 h-4 text-[#00A57E]" />
    }
    if (type.startsWith('document')) {
      return <FileText className="w-4 h-4 text-blue-500" />
    }
    if (type.startsWith('transfer')) {
      return <ArrowRightLeft className="w-4 h-4 text-amber-500" />
    }
    return <UserCheck className="w-4 h-4 text-[#6B7272]" />
  }

  return (
    <div className={cn('relative inline-block', className)} ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6] transition-colors focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-[#C53030] rounded-full ring-2 ring-white animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-[#E4E7E7] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E7E7] bg-white">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[#0A0A0A]">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-medium text-[#00805F] bg-[#E6F6F2] px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-xs text-[#00A57E] hover:text-[#00805F] font-medium flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F5F6F6]">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Bell className="w-8 h-8 text-[#E4E7E7] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#0A0A0A]">All caught up!</p>
                <p className="text-xs text-[#6B7272] mt-0.5">No notifications at the moment.</p>
              </div>
            ) : (
              <>
                {todayList.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider bg-[#F5F6F6]">
                      Today
                    </div>
                    {todayList.map((notif) => (
                      <NotificationRow
                        key={notif.id}
                        notif={notif}
                        icon={getIconForType(notif.type)}
                        onMarkRead={handleMarkAsRead}
                      />
                    ))}
                  </div>
                )}

                {earlierList.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider bg-[#F5F6F6]">
                      Earlier
                    </div>
                    {earlierList.map((notif) => (
                      <NotificationRow
                        key={notif.id}
                        notif={notif}
                        icon={getIconForType(notif.type)}
                        onMarkRead={handleMarkAsRead}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-[#E4E7E7] bg-[#F5F6F6] text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-[#00A57E] hover:text-[#00805F] transition-colors inline-flex items-center gap-1"
            >
              View all notifications
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({
  notif,
  icon,
  onMarkRead,
}: {
  notif: NotificationItem
  icon: React.ReactNode
  onMarkRead: (id: string, link?: string | null) => void
}) {
  const isUnread = !notif.read_at

  return (
    <div
      onClick={() => onMarkRead(notif.id, notif.link)}
      className={cn(
        'flex items-start gap-3 px-4 py-3 hover:bg-[#F5F6F6]/80 cursor-pointer transition-colors relative group',
        isUnread && 'bg-[#E6F6F2]/30'
      )}
    >
      <div className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-[#F5F6F6] border border-[#E4E7E7]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={cn('text-xs font-medium text-[#0A0A0A] truncate', isUnread && 'font-semibold')}>
            {notif.title}
          </p>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-[#00A57E] shrink-0" />
          )}
        </div>
        <p className="text-xs text-[#6B7272] line-clamp-2 mt-0.5 leading-relaxed">
          {notif.body}
        </p>
        <span className="text-[10px] text-[#6B7272]/70 mt-1 block">
          {formatRelativeTime(notif.created_at)}
        </span>
      </div>
    </div>
  )
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
