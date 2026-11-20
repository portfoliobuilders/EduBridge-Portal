import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { FileBarChart } from 'lucide-react'

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections & Financial Reports"
        subtitle="Real-time collection reports, day-end cash summaries, and outstanding balances"
      />
      <EmptyState
        icon={FileBarChart}
        title="Reporting suite will be activated in Part 7"
        description="Staff view their own collections; owners view organization-wide revenue, staff leaderboards, and voided logs."
      />
    </div>
  )
}
