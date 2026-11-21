import React from 'react'
import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/PageHeader'
import { AdminNav } from '@/components/admin/AdminNav'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { StaffClient, type StaffMember } from './StaffClient'

export const dynamic = 'force-dynamic'

interface StaffRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'owner' | 'staff'
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
  collections_this_month: number | null
}

export default async function StaffManagementPage() {
  const { user } = await requireOwner()
  const supabase = await createClient()

  // Fetch staff list via get_staff_list RPC
  const { data: staffData } = await supabase.rpc('get_staff_list')

  const typedStaff = (staffData ?? []) as unknown as StaffRow[]
  const staffList: StaffMember[] = typedStaff.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    email: s.email,
    phone: s.phone,
    role: s.role,
    is_active: s.is_active,
    last_sign_in_at: s.last_sign_in_at,
    created_at: s.created_at,
    collections_this_month: Number(s.collections_this_month ?? 0),
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
        subtitle="Invite team members, assign counsellor/owner roles, and monitor monthly collections"
      />

      <AdminNav />

      <StaffClient initialStaff={staffList} currentUserId={user.id} />
    </div>
  )
}
