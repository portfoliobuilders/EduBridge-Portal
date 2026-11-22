import React from 'react'
import { requireUser } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { ReportsClient } from '@/components/reports/ReportsClient'
import { fetchReportFilterOptionsAction } from './actions'

interface ReportsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { profile, user } = await requireUser()
  const { tab } = await searchParams

  const optionsRes = await fetchReportFilterOptionsAction()
  const filterOptions = optionsRes.data || {
    universities: [],
    courses: [],
    staffList: [],
    vatEnabled: false,
  }

  const validTabs = ['collections', 'outstanding', 'dayend', 'voids', 'vat'] as const
  const activeTab = validTabs.includes(tab as (typeof validTabs)[number])
    ? (tab as (typeof validTabs)[number])
    : 'collections'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections & Financial Reports"
        subtitle="Real-time collection reports, day-end cash summaries, and outstanding balances (Asia/Dubai)"
      />

      <ReportsClient
        filterOptions={filterOptions}
        userRole={profile.role}
        userId={user.id}
        initialTab={activeTab}
      />
    </div>
  )
}
