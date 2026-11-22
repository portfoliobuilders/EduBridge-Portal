import React from 'react'
import { requireAdminOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/PageHeader'
import { AdminNav } from '@/components/admin/AdminNav'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { StaffClient, type StaffMember, type JobTitleOption } from './StaffClient'

export const dynamic = 'force-dynamic'

interface StaffRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'super_admin' | 'admin' | 'staff' | 'owner'
  job_title: string | null
  reports_to: string | null
  reports_to_name: string | null
  admin_scope: string
  is_support: boolean
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
  collections_this_month: number | null
}

export default async function StaffManagementPage() {
  const { user, profile } = await requireAdminOrAbove()
  const supabase = await createClient()

  // Fetch staff list via get_staff_list RPC (automatically scoped in SQL)
  const { data: staffData } = await supabase.rpc('get_staff_list')

  // Fetch active job titles
  const { data: jobTitlesData } = await supabase
    .from('job_titles')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const typedStaff = (staffData ?? []) as unknown as StaffRow[]
  const staffList: StaffMember[] = typedStaff.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    email: s.email,
    phone: s.phone,
    role: s.role === 'owner' ? 'super_admin' : s.role,
    job_title: s.job_title ?? null,
    reports_to: s.reports_to ?? null,
    reports_to_name: s.reports_to_name ?? null,
    admin_scope: (s.admin_scope as 'team' | 'company') ?? 'team',
    is_support: Boolean(s.is_support),
    is_active: s.is_active,
    last_sign_in_at: s.last_sign_in_at,
    created_at: s.created_at,
    collections_this_month: Number(s.collections_this_month ?? 0),
  }))

  const jobTitles: JobTitleOption[] = (jobTitlesData ?? []).map((jt) => ({
    id: jt.id,
    name: jt.name,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Staff Management' },
        ]}
      />

      <PageHeader
        title="Staff Management"
        subtitle="Manage team members, roles, reporting lines, and monitor monthly collections"
      />

      <AdminNav />

      <StaffClient
        initialStaff={staffList}
        currentUserId={user.id}
        currentUserRole={profile.role === 'owner' ? 'super_admin' : profile.role}
        jobTitles={jobTitles}
      />
    </div>
  )
}
