import React from 'react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/navigation/AppShell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile } = await requireUser()
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: celebrations } = await (supabase.rpc as any)('get_celebrations_today')

  return (
    <AppShell
      profile={profile}
      initialCelebrations={Array.isArray(celebrations) ? celebrations : []}
    >
      {children}
    </AppShell>
  )
}
