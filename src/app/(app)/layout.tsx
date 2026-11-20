import React from 'react'
import { requireUser } from '@/lib/auth'
import { AppShell } from '@/components/navigation/AppShell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile } = await requireUser()

  return <AppShell profile={profile}>{children}</AppShell>
}
