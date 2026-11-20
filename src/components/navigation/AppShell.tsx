'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Home,
  Users,
  PlusCircle,
  FileBarChart,
  ShieldCheck,
  Search,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/app/(auth)/login/actions'
import { GlobalSearchDialog } from '@/components/GlobalSearchDialog'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/auth'

export function AppShell({
  profile,
  children,
}: {
  profile: Profile
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const isOwner = profile.role === 'owner'

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/students', label: 'Students', icon: Users },
    { href: '/receipts/new', label: 'New Receipt', icon: PlusCircle, isAction: true },
    { href: '/reports', label: 'Reports', icon: FileBarChart },
    ...(isOwner ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F5F6F6]">
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Desktop Left Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-border shrink-0 fixed inset-y-0 z-30">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/" className="inline-block">
            <Image
              src="/brand/edubridge-logo-color.svg"
              alt="EduBridge Education"
              width={160}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>

        {/* Global Search Button */}
        <div className="px-4 py-4">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground bg-[#F5F6F6] hover:bg-[#EAEAEA] rounded-xl border border-border transition-colors"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              Quick search...
            </span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)

            if (item.isAction) {
              return (
                <div key={item.href} className="py-2">
                  <Link
                    href={item.href}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-[#00805F] text-white text-sm font-medium shadow-sm transition-all"
                  >
                    <Icon className="w-4 h-4" />
                    + New Receipt
                  </Link>
                </div>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#E6F6F2] text-[#00805F] font-semibold'
                    : 'text-foreground hover:bg-[#F5F6F6] hover:text-[#00A57E]'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-[#00805F]' : 'text-muted-foreground')} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-border bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">
                {profile.full_name}
              </span>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                {profile.role}
              </span>
            </div>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </form>
          </div>
          <div className="text-[10px] text-muted-foreground/80 flex items-center justify-between">
            <span>Dubai, UAE</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Mobile Top Header (< 1024px) */}
        <header className="lg:hidden h-14 bg-white border-b border-border px-4 flex items-center justify-between sticky top-0 z-20">
          <Link href="/" className="inline-block">
            <Image
              src="/brand/edubridge-logo-color.svg"
              alt="EduBridge Education"
              width={130}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="h-9 w-9 rounded-xl border-border text-muted-foreground"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </Button>
            <form action={signOutAction}>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-muted-foreground"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </header>

        {/* Page Children (mobile padded for bottom nav) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Navigation (< 1024px) */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-border px-2 py-1.5 flex items-center justify-around z-30">
          <Link
            href="/"
            className={cn(
              'flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium transition-colors',
              pathname === '/' ? 'text-primary font-semibold' : 'text-muted-foreground'
            )}
          >
            <Home className="w-5 h-5 mb-0.5" />
            Home
          </Link>

          <Link
            href="/students"
            className={cn(
              'flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium transition-colors',
              pathname.startsWith('/students') ? 'text-primary font-semibold' : 'text-muted-foreground'
            )}
          >
            <Users className="w-5 h-5 mb-0.5" />
            Students
          </Link>

          {/* Prominent Center Action Button */}
          <Link
            href="/receipts/new"
            className="flex flex-col items-center justify-center -mt-5 bg-primary hover:bg-[#00805F] text-white w-12 h-12 rounded-full shadow-md transition-all active:scale-95"
            aria-label="New Receipt"
          >
            <PlusCircle className="w-6 h-6" />
          </Link>

          <Link
            href="/reports"
            className={cn(
              'flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium transition-colors',
              pathname.startsWith('/reports') ? 'text-primary font-semibold' : 'text-muted-foreground'
            )}
          >
            <FileBarChart className="w-5 h-5 mb-0.5" />
            Reports
          </Link>

          {isOwner && (
            <Link
              href="/admin"
              className={cn(
                'flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium transition-colors',
                pathname.startsWith('/admin') ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              <ShieldCheck className="w-5 h-5 mb-0.5" />
              Admin
            </Link>
          )}
        </nav>
      </div>
    </div>
  )
}
