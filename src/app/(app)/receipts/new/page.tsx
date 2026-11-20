import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { PlusCircle } from 'lucide-react'

export default function NewReceiptPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record Payment"
        subtitle="Issue an official gapless receipt voucher for student fee payment"
      />
      <EmptyState
        icon={PlusCircle}
        title="Payment recording interface will be wired in Part 5"
        description="Select student and enrollment, enter payment amount, select mode (Card, Cash, Link, Transfer), and issue signed voucher."
      />
    </div>
  )
}
