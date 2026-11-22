'use client'

import React, { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true
}

export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md transition-all"
    >
      <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
      <span>
        You&apos;re offline. Payment recording and receipts require an active internet connection.
      </span>
    </div>
  )
}
