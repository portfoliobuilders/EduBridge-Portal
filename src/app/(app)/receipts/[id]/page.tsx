import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Receipt } from 'lucide-react'

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipt Voucher"
        subtitle={`Receipt Reference ID: ${id}`}
      />
      <EmptyState
        icon={Receipt}
        title="Receipt preview and share actions will be wired in Part 5 & 6"
        description="High-fidelity A5 voucher view with Web Share, WhatsApp prefill, Email attachment, and PDF download."
      />
    </div>
  )
}
