'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CheckCheck,
  Gift,
  CreditCard,
  UserCheck,
  FileText,
  ArrowRightLeft,
  Calendar,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationItem,
} from '@/app/(app)/notifications/actions'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from '@/components/ui/sheet'
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
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile viewport (<640px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    let active = true
    getNotificationsAction('all', 20).then((res) => {
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
            getNotificationsAction('all', 20).then((res) => {
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
      return (
        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0">
          <Gift className="w-4 h-4" />
        </div>
      )
    }
    if (type.startsWith('payment') || type.startsWith('receipt')) {
      return (
        <div className="w-8 h-8 rounded-full bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5] flex items-center justify-center shrink-0">
          <CreditCard className="w-4 h-4" />
        </div>
      )
    }
    if (type.startsWith('document')) {
      return (
        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
      )
    }
    if (type.startsWith('transfer')) {
      return (
        <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-200/60 flex items-center justify-center shrink-0">
          <ArrowRightLeft className="w-4 h-4" />
        </div>
      )
    }
    if (type.startsWith('leave') || type.startsWith('attendance')) {
      return (
        <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 border border-teal-200/60 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4" />
        </div>
      )
    }
    return (
      <div className="w-8 h-8 rounded-full bg-[#F5F6F6] text-[#6B7272] border border-[#E4E7E7] flex items-center justify-center shrink-0">
        <UserCheck className="w-4 h-4" />
      </div>
    )
  }

  const bellTriggerButton = (
    <button
      type="button"
      className={cn(
        'relative p-2 rounded-xl text-[#6B7272] hover:text-[#0A0A0A] hover:bg-[#F5F6F6] transition-colors focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20 cursor-pointer',
        className
      )}
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
  )

  const dropdownContent = (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E4E7E7] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-sm text-[#0A0A0A]">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="text-[11px] font-semibold text-[#00805F] bg-[#E6F6F2] px-2 py-0.5 rounded-full border border-[#CCEDE5]">
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={loading}
            className="text-xs text-[#00A57E] hover:text-[#00805F] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#F5F6F6]">
        {notifications.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[#E6F6F2] text-[#00A57E] flex items-center justify-center mx-auto mb-3">
              <Bell className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-[#0A0A0A]">You&apos;re all caught up</p>
            <p className="text-xs text-[#6B7272] mt-0.5">No notifications right now.</p>
          </div>
        ) : (
          <>
            {todayList.length > 0 && (
              <div>
                <div className="px-5 py-1.5 text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider bg-[#F5F6F6]/80 sticky top-0 z-10 backdrop-blur-xs border-b border-[#E4E7E7]/40">
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
                <div className="px-5 py-1.5 text-[11px] font-semibold text-[#6B7272] uppercase tracking-wider bg-[#F5F6F6]/80 sticky top-0 z-10 backdrop-blur-xs border-b border-[#E4E7E7]/40">
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
      <div className="px-5 py-3 border-t border-[#E4E7E7] bg-[#F5F6F6]/70 text-center shrink-0">
        <Link
          href="/notifications"
          onClick={() => setIsOpen(false)}
          className="text-xs font-semibold text-[#00A57E] hover:text-[#00805F] transition-colors inline-flex items-center gap-1.5"
        >
          <span>View all notifications →</span>
        </Link>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger render={bellTriggerButton} />
        <SheetContent side="bottom" className="max-h-[85vh] p-0 flex flex-col rounded-t-[20px] overflow-hidden">
          {dropdownContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={bellTriggerButton} />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        className="w-[400px] max-h-[70vh] p-0 flex flex-col overflow-hidden rounded-2xl shadow-xl border border-[#E4E7E7] bg-white"
      >
        {dropdownContent}
      </PopoverContent>
    </Popover>
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
        'flex items-start gap-3 px-5 py-3.5 hover:bg-[#F5F6F6] cursor-pointer transition-colors relative group',
        isUnread && 'bg-[#E6F6F2]/25'
      )}
      title={notif.body}
    >
      <div className="shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-xs font-medium text-[#0A0A0A] truncate', isUnread && 'font-semibold text-[#0A0A0A]')}>
            {notif.title}
          </p>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-[#00A57E] shrink-0" />
          )}
        </div>
        <p className="text-xs text-[#6B7272] line-clamp-2 mt-0.5 leading-relaxed">
          {notif.body}
        </p>
        <span className="text-[10px] text-[#6B7272]/70 mt-1 block font-medium">
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
