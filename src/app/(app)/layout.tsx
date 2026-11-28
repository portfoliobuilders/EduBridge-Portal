import React from 'react'
import { requireUser } from '@/lib/auth'
import { getCelebrationsTodayCached } from '@/lib/celebrations'
import { AppShell } from '@/components/navigation/AppShell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [{ profile }, celebrations] = await Promise.all([
    requireUser(),
    getCelebrationsTodayCached(),
  ])

  return (
    <AppShell
      profile={profile}
      initialCelebrations={celebrations}
    >
      {children}
    </AppShell>
  )
}
