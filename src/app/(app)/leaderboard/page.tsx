import React from 'react'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { getLeaderboardAction } from './actions'
import { LeaderboardClient } from './LeaderboardClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Staff Leaderboard',
}

export default async function LeaderboardPage() {
  const { profile } = await requireUser()
  const { data, error, showAedToStaff } = await getLeaderboardAction({
    period: 'this_month',
    metric: 'admissions',
  })

  return (
    <LeaderboardClient
      initialEntries={data}
      initialError={error}
      initialPeriod="this_month"
      initialMetric="admissions"
      showAedToStaff={showAedToStaff}
      viewerRole={profile.role}
      viewerId={profile.id}
    />
  )
}
