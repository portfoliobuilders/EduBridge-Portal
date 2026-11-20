import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Users } from 'lucide-react'

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Students Directory"
        subtitle="Manage admitted students, enrollment packages, and fee balances"
      />
      <EmptyState
        icon={Users}
        title="Student directory will be initialized in Part 4"
        description="Search students by name, mobile, or student code, record payments, and view ledger balances."
      />
    </div>
  )
}
