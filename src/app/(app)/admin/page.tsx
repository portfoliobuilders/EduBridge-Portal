import React from 'react'
import { requireOwner } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { BookOpen, UserCog, Settings as SettingsIcon } from 'lucide-react'
import Link from 'next/link'

export default async function AdminPage() {
  // Only owners may view this page; staff get an immediate 404
  await requireOwner()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Management"
        subtitle="Master catalogs, staff permissions, and company settings (Owner Only)"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href="/admin/programs"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Programs Catalog
            </h3>
            <p className="text-sm text-muted-foreground">
              Manage universities, degree levels, courses, specializations, and default fees.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-6 inline-flex items-center">
            Configure programs &rarr;
          </span>
        </Link>

        <Link
          href="/admin/staff"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <UserCog className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Staff Management
            </h3>
            <p className="text-sm text-muted-foreground">
              Invite counsellors, assign roles, manage active status, and monitor collections.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-6 inline-flex items-center">
            Manage staff &rarr;
          </span>
        </Link>

        <Link
          href="/admin/settings"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Company Settings
            </h3>
            <p className="text-sm text-muted-foreground">
              Letterhead, business details, TRN, logo upload, receipt numbering prefixes, and VAT toggle.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-6 inline-flex items-center">
            Update settings &rarr;
          </span>
        </Link>
      </div>
    </div>
  )
}
