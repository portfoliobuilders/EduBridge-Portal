'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CheckCheck,
  Gift,
  CreditCard,
  FileText,
  ArrowRightLeft,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationItem,
} from './actions'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'unread' | 'read' | 'celebrations' | 'payments' | 'transfers'

export default function NotificationsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterType>('all')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getNotificationsAction(filter, 100).then((res) => {
      if (!active) return
      if (res.success && res.notifications) {
        setNotifications(res.notifications)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [filter])

  const handleMarkRead = async (id: string, link?: string | null) => {
    await markNotificationReadAction(id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
    if (link) {
      router.push(link)
    }
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsReadAction()
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
    )
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length

  const getIconForType = (type: string) => {
    if (type.startsWith('celebration')) {
      return <Gift className="w-5 h-5 text-[#F5C451]" />
    }
    if (type.startsWith('payment') || type.startsWith('receipt')) {
      return <CreditCard className="w-5 h-5 text-[#00A57E]" />
    }
    if (type.startsWith('document')) {
      return <FileText className="w-5 h-5 text-blue-500" />
    }
    if (type.startsWith('transfer')) {
      return <ArrowRightLeft className="w-5 h-5 text-amber-500" />
    }
    return <UserCheck className="w-5 h-5 text-[#6B7272]" />
  }

  const filters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'read', label: 'Read' },
    { id: 'celebrations', label: 'Celebrations' },
    { id: 'payments', label: 'Payments' },
    { id: 'transfers', label: 'Transfers' },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E4E7E7] shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-[#0A0A0A] flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#00A57E]" />
            Notifications
          </h1>
          <p className="text-xs text-[#6B7272] mt-1">
            Stay informed with real-time updates on candidate payments, documents, and team milestones.
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            className="rounded-xl border-[#E4E7E7] text-[#00A57E] hover:text-[#00805F] hover:bg-[#E6F6F2] font-semibold self-start sm:self-center"
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors border',
              filter === f.id
                ? 'bg-[#00A57E] text-white border-[#00A57E] shadow-xs'
                : 'bg-white text-[#6B7272] border-[#E4E7E7] hover:bg-[#F5F6F6] hover:text-[#0A0A0A]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] overflow-hidden shadow-xs divide-y divide-[#E4E7E7]">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#6B7272]">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <Bell className="w-12 h-12 text-[#E4E7E7] mx-auto mb-3" />
            <p className="text-base font-semibold text-[#0A0A0A]">No notifications found</p>
            <p className="text-xs text-[#6B7272] mt-1">
              {filter === 'unread'
                ? "You're all caught up! No unread notifications."
                : 'There are no notifications matching the selected filter.'}
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isUnread = !notif.read_at
            return (
              <div
                key={notif.id}
                onClick={() => handleMarkRead(notif.id, notif.link)}
                className={cn(
                  'flex items-start gap-4 p-4 sm:p-5 hover:bg-[#F5F6F6]/70 transition-colors cursor-pointer',
                  isUnread && 'bg-[#E6F6F2]/25'
                )}
              >
                <div className="shrink-0 p-2.5 rounded-xl bg-[#F5F6F6] border border-[#E4E7E7] mt-0.5">
                  {getIconForType(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={cn('text-sm text-[#0A0A0A]', isUnread ? 'font-bold' : 'font-semibold')}>
                      {notif.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#6B7272] whitespace-nowrap">
                        {new Date(notif.created_at).toLocaleString('en-AE', {
                          timeZone: 'Asia/Dubai',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      {isUnread && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00A57E] shrink-0" title="Unread" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[#6B7272] mt-1 leading-relaxed">
                    {notif.body}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
