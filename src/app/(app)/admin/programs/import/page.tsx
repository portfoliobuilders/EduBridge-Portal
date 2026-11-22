import React from 'react'
import { requireAdminOrAbove } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { BulkImportClient } from './BulkImportClient'

export const dynamic = 'force-dynamic'

export default async function BulkImportPage() {
  await requireAdminOrAbove()

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Programmes', href: '/admin/programs' },
          { label: 'Bulk Import' },
        ]}
      />

      <PageHeader
        title="Bulk Import Programmes"
        subtitle="Upload CSV files to import universities, degree courses, and specializations in a single transaction"
      />

      <BulkImportClient />
    </div>
  )
}
