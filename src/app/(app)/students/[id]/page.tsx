import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { User } from 'lucide-react'

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Details & Ledger"
        subtitle={`Student Profile ID: ${id}`}
      />
      <EmptyState
        icon={User}
        title="Student detail and ledger will be wired in Part 4"
        description="Detailed ledger with running balances, contact actions (call/WhatsApp), and fee statements."
      />
    </div>
  )
}
