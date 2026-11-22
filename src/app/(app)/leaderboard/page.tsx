import React from 'react'
import { requireUser } from '@/lib/auth'
import { getLeaderboardAction } from './actions'
import { LeaderboardClient } from './LeaderboardClient'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const { profile } = await requireUser()
  const { data, showAedToStaff } = await getLeaderboardAction({
    period: 'this_month',
    metric: 'admissions',
  })

  return (
    <LeaderboardClient
      initialEntries={data}
      initialPeriod="this_month"
      initialMetric="admissions"
      showAedToStaff={showAedToStaff}
      viewerRole={profile.role}
      viewerId={profile.id}
    />
  )
}
