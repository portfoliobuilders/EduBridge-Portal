import React from 'react'
import type { Metadata } from 'next'
import { requireAdminOrAbove } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Admin Console',
}
import { PageHeader } from '@/components/PageHeader'
import { AdminNav } from '@/components/admin/AdminNav'
import { BookOpen, UserCog, Settings as SettingsIcon, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  // Only super_admins and admins may view this page; staff get an immediate 404
  await requireAdminOrAbove()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Management"
        subtitle="Master catalogs, staff permissions, and company settings (Owner Only)"
      />

      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Link
          href="/admin/programs"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Programmes Catalog
            </h3>
            <p className="text-sm text-muted-foreground">
              Manage partner universities, degree levels, courses, specializations, and default fees.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-6 inline-flex items-center">
            Configure programs &rarr;
          </span>
        </Link>

        <Link
          href="/admin/programs/import"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Bulk CSV Import
            </h3>
            <p className="text-sm text-muted-foreground">
              Import hundreds of universities, courses, and specializations via CSV with pre-flight duplicate checking.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-6 inline-flex items-center">
            Open CSV importer &rarr;
          </span>
        </Link>

        <Link
          href="/admin/staff"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
              <UserCog className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Staff Management
            </h3>
            <p className="text-sm text-muted-foreground">
              Invite counsellors, assign roles, manage active status, and monitor monthly collections.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-6 inline-flex items-center">
            Manage staff &rarr;
          </span>
        </Link>

        <Link
          href="/admin/settings"
          className="bg-white p-6 rounded-2xl border border-border shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1 font-display">
              Company Settings
            </h3>
            <p className="text-sm text-muted-foreground">
              Letterhead, business details, TRN, logo upload, receipt prefixes, VAT toggle, and messaging templates.
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
