'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, UserCog, Settings as SettingsIcon, LayoutDashboard, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AdminNav() {
  const pathname = usePathname()

  const tabs = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/admin/programs', label: 'Programmes', icon: BookOpen },
    { href: '/admin/programs/import', label: 'Bulk Import', icon: FileSpreadsheet, exact: true },
    { href: '/admin/staff', label: 'Staff', icon: UserCog },
    { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  ]

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-2 mb-6 scrollbar-none">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || (tab.href !== '/admin' && pathname.startsWith(tab.href) && !pathname.startsWith('/admin/programs/import'))

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-xl transition-all whitespace-nowrap',
              isActive
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
