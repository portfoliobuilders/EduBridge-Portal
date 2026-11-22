'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  Users,
  Plus,
  FileBarChart,
  ShieldCheck,
  Search,
  LogOut,
  KeyRound,
  ChevronRight,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)
  const isOwner = profile.role === 'owner'

  // Cmd+K / Ctrl+K keyboard shortcut for Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Global "N" keyboard shortcut to open New Receipt (when not typing in form inputs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          router.push('/receipts/new')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])

  // Track any sheet/modal open in the DOM to hide the mobile FAB
  useEffect(() => {
    const checkModals = () => {
      const modalEl = document.querySelector(
        '[data-slot="sheet-content"], [data-slot="dialog-content"], [role="dialog"]'
      )
      setIsAnyModalOpen(!!modalEl)
    }

    const observer = new MutationObserver(checkModals)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    })
    return () => observer.disconnect()
  }, [])

  const desktopNavItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/candidates', label: 'Candidates', icon: Users },
    { href: '/reports', label: 'Reports', icon: FileBarChart },
    ...(isOwner ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F5F6F6]">
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Desktop Left Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-[#E4E7E7] shrink-0 fixed inset-y-0 z-30">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[#E4E7E7] shrink-0">
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
        <div className="px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#6B7272] bg-[#F5F6F6] hover:bg-[#EAEAEA] rounded-xl border border-[#E4E7E7] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#6B7272]" />
              Quick search...
            </span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-[#6B7272]">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Navigation Links (Scrollable area) */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-1 py-1">
          {desktopNavItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#E6F6F2] text-[#00805F] font-semibold'
                    : 'text-[#0A0A0A] hover:bg-[#F5F6F6] hover:text-[#00A57E]'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4',
                    isActive ? 'text-[#00805F]' : 'text-[#6B7272]'
                  )}
                />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Sticky Footer: Divider -> "+ New Receipt [N]" button -> Divider -> User Card */}
        <div className="shrink-0 p-4 border-t border-[#E4E7E7] bg-white space-y-3">
          <Link
            href="/receipts/new"
            className="flex items-center justify-between w-full py-2.5 px-4 rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white text-sm font-semibold shadow-xs transition-all group"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              + New Receipt
            </span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center justify-center rounded bg-white/20 px-1.5 font-mono text-[11px] font-bold text-white group-hover:bg-white/30">
              N
            </kbd>
          </Link>

          <div className="border-t border-[#E4E7E7] pt-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-[#0A0A0A] truncate">
                  {profile.full_name}
                </span>
                <span className="text-[10px] uppercase font-bold text-[#6B7272] tracking-wider">
                  {profile.role}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLogoutDialogOpen(true)}
                className="h-8 w-8 flex items-center justify-center text-[#6B7272] hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="text-[10px] text-[#6B7272]/80 flex items-center justify-between mt-2">
              <span>Dubai, UAE</span>
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Mobile Top Header (< 1024px): Logo + Search only */}
        <header className="lg:hidden h-14 bg-white border-b border-[#E4E7E7] px-4 flex items-center justify-between sticky top-0 z-20">
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
              className="h-9 w-9 rounded-xl border-[#E4E7E7] text-[#6B7272]"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Page Children (mobile padded for bottom nav + FAB) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-28 lg:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Navigation (< 1024px): 2 + FAB + 2 Layout */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E4E7E7] z-30 pb-[env(safe-area-inset-bottom)] h-16 flex items-center justify-around px-2">
          {/* 1. Home */}
          <Link
            href="/"
            className={cn(
              'min-h-[48px] min-w-[48px] flex flex-col items-center justify-center py-1 px-2 text-[10px] transition-colors',
              pathname === '/'
                ? 'text-[#00A57E] font-semibold'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            <Home className="w-5 h-5 mb-0.5" />
            Home
          </Link>

          {/* 2. Candidates */}
          <Link
            href="/candidates"
            className={cn(
              'min-h-[48px] min-w-[48px] flex flex-col items-center justify-center py-1 px-2 text-[10px] transition-colors',
              pathname.startsWith('/candidates')
                ? 'text-[#00A57E] font-semibold'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            <Users className="w-5 h-5 mb-0.5" />
            Candidates
          </Link>

          {/* 3. Center FAB (56px circle, #00A57E, white +, hidden if modal/sheet open) */}
          <div className="relative min-w-[56px] flex items-center justify-center">
            {!isAnyModalOpen && !accountOpen && (
              <Link
                href="/receipts/new"
                aria-label="New receipt"
                title="New receipt"
                className="w-14 h-14 rounded-full bg-[#00A57E] hover:bg-[#00805F] text-white shadow-lg shadow-[#00A57E]/25 flex items-center justify-center absolute -top-7 border-4 border-white active:scale-95 transition-transform"
              >
                <Plus className="w-7 h-7 stroke-[2.5]" />
              </Link>
            )}
          </div>

          {/* 4. Reports */}
          <Link
            href="/reports"
            className={cn(
              'min-h-[48px] min-w-[48px] flex flex-col items-center justify-center py-1 px-2 text-[10px] transition-colors',
              pathname.startsWith('/reports')
                ? 'text-[#00A57E] font-semibold'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            <FileBarChart className="w-5 h-5 mb-0.5" />
            Reports
          </Link>

          {/* 5. Account */}
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className={cn(
              'min-h-[48px] min-w-[48px] flex flex-col items-center justify-center py-1 px-2 text-[10px] transition-colors',
              accountOpen
                ? 'text-[#00A57E] font-semibold'
                : 'text-[#6B7272] hover:text-[#0A0A0A]'
            )}
          >
            <User className="w-5 h-5 mb-0.5" />
            Account
          </button>
        </nav>
      </div>

      {/* Account Bottom Sheet */}
      <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-[#E4E7E7] bg-white p-6 pb-10 max-w-lg mx-auto"
        >
          <SheetHeader className="pb-4 border-b border-[#E4E7E7] text-left">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#E6F6F2] text-[#00A57E] flex items-center justify-center font-bold text-lg">
                {profile.full_name?.charAt(0) || 'U'}
              </div>
              <div>
                <SheetTitle className="text-base font-bold text-[#0A0A0A]">
                  {profile.full_name}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#E6F6F2] text-[#00A57E]">
                    {profile.role}
                  </span>
                  <span className="text-xs text-[#6B7272]">EduBridge Dubai</span>
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-2 pt-4">
            {isOwner && (
              <Link
                href="/admin"
                onClick={() => setAccountOpen(false)}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#E4E7E7] hover:bg-[#F5F6F6] text-sm font-medium text-[#0A0A0A] transition"
              >
                <span className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#00A57E]" />
                  Admin Console & Settings
                </span>
                <ChevronRight className="w-4 h-4 text-[#6B7272]" />
              </Link>
            )}

            <Link
              href="/reset-password"
              onClick={() => setAccountOpen(false)}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-[#E4E7E7] hover:bg-[#F5F6F6] text-sm font-medium text-[#0A0A0A] transition"
            >
              <span className="flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-[#00A57E]" />
                Change Password
              </span>
              <ChevronRight className="w-4 h-4 text-[#6B7272]" />
            </Link>

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                setLogoutDialogOpen(true)
              }}
              className="flex items-center justify-between w-full p-3.5 rounded-2xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-sm font-medium text-red-600 transition"
            >
              <span className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-red-600" />
                Sign Out
              </span>
              <ChevronRight className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-6 bg-white border border-[#E4E7E7]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0A0A0A]">
              Confirm Sign Out
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272] mt-1.5">
              Are you sure you want to end your session? Any unsaved edits will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogoutDialogOpen(false)}
              className="rounded-xl border-[#E4E7E7] text-xs h-9"
            >
              Cancel
            </Button>
            <form action={signOutAction}>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs h-9"
              >
                Sign Out
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
