import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  Phone,
} from 'lucide-react'
import { requireAdminOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AdminStaffEditForm } from './AdminStaffEditForm'

interface AdminStaffDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminStaffDetailPage({ params }: AdminStaffDetailPageProps) {
  await requireAdminOrAbove()
  const { id } = await params
  const supabase = await createClient()

  // Query staff_directory_view which enforces RLS: sensitive details visible only to self + admins in scope + super_admin
  const { data: staff, error } = await supabase
    .from('staff_directory_view')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !staff) {
    notFound()
  }

  // Get active managers for reporting hierarchy dropdown
  const { data: managers } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['admin', 'super_admin', 'owner'])
    .eq('is_active', true)

  // Get active offices and staff attendance settings
  const { data: offices } = await supabase
    .from('offices')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  const { data: attendanceSettings } = await supabase
    .from('staff_attendance_settings')
    .select('*')
    .eq('user_id', id)
    .maybeSingle()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin/staff"
          className="inline-flex items-center text-xs font-semibold text-[#00A57E] hover:text-[#00805F] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Staff Management
        </Link>
      </div>

      {/* Staff Header Card */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-[#00A57E] text-white flex items-center justify-center font-bold text-2xl overflow-hidden ring-4 ring-[#E6F6F2] shrink-0">
            {staff.avatar_url ? (
              <Image
                src={staff.avatar_url}
                alt={staff.full_name || 'Staff'}
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            ) : (
              (staff.full_name || 'S')[0]
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#0A0A0A]">{staff.full_name || 'Staff Member'}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5] capitalize">
                {(staff.role || 'staff').replace('_', ' ')}
              </span>
              {!staff.is_active && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-[#6B7272] mt-0.5">
              {staff.job_title || 'Team Member'} · {staff.work_email}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-[#6B7272]">
              {staff.employee_id && (
                <span className="flex items-center gap-1 font-medium">
                  <BadgeCheck className="w-3.5 h-3.5 text-[#00A57E]" />
                  ID: {staff.employee_id}
                </span>
              )}
              {staff.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {staff.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Editable Fields */}
      <AdminStaffEditForm
        staff={staff}
        managers={managers || []}
        attendanceSettings={attendanceSettings}
        offices={offices || []}
      />
    </div>
  )
}
