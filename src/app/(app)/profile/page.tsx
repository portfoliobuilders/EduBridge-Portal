import React from 'react'
import type { Metadata } from 'next'
import { getMyProfileAction } from './actions'
import { getMonthAttendanceAction } from '../attendance/actions'
import { StaffProfileForm } from '@/components/profile/StaffProfileForm'
import { ProfileAttendanceSection } from '@/components/profile/ProfileAttendanceSection'

export const metadata: Metadata = {
  title: 'My Profile',
}

export default async function ProfilePage() {
  const res = await getMyProfileAction()

  if (!res.success || !res.profile) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-[#E4E7E7] max-w-xl mx-auto my-12">
        <h2 className="font-display text-lg font-bold text-[#0A0A0A]">Could not load profile</h2>
        <p className="text-xs text-[#6B7272] mt-1">{res.error || 'Please sign in again.'}</p>
      </div>
    )
  }

  const attendanceRes = await getMonthAttendanceAction(undefined, res.profile.id)

  return (
    <div className="max-w-[960px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0A0A0A] tracking-tight">
          My Profile
        </h1>
        <p className="text-xs text-[#6B7272] mt-1">
          Manage your personal and contact details, confidential emergency contact, and profile photo.
        </p>
      </div>

      <StaffProfileForm initialProfile={res.profile} />

      {attendanceRes.success && (
        <ProfileAttendanceSection
          initialData={attendanceRes.data}
          userId={res.profile.id}
        />
      )}
    </div>
  )
}
