import React from 'react'
import { getMyProfileAction } from './actions'
import { StaffProfileForm } from '@/components/profile/StaffProfileForm'

export default async function ProfilePage() {
  const res = await getMyProfileAction()

  if (!res.success || !res.profile) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-[#E4E7E7] max-w-xl mx-auto my-12">
        <h2 className="text-lg font-bold text-[#0A0A0A]">Could not load profile</h2>
        <p className="text-xs text-[#6B7272] mt-1">{res.error || 'Please sign in again.'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">
          My Staff Profile
        </h1>
        <p className="text-xs text-[#6B7272] mt-1">
          Manage your contact information, photo, celebration preferences, and confidential details.
        </p>
      </div>

      <StaffProfileForm initialProfile={res.profile} />
    </div>
  )
}
