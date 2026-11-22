'use client'

import React, { useState, useRef } from 'react'
import Image from 'next/image'
import {
  User,
  Upload,
  Lock,
  Calendar,
  HeartHandshake,
  Sparkles,
  Save,
  CheckCircle,
  AlertCircle,
  BadgeCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  updateMyProfileAction,
  uploadAvatarAction,
  type StaffProfileFull,
} from '@/app/(app)/profile/actions'

interface StaffProfileFormProps {
  initialProfile: StaffProfileFull
}

export function StaffProfileForm({ initialProfile }: StaffProfileFormProps) {
  const [profile, setProfile] = useState<StaffProfileFull>(initialProfile)
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [personalEmail, setPersonalEmail] = useState(profile.personal_email || '')
  const [dob, setDob] = useState(profile.dob || '')
  const [address, setAddress] = useState(profile.address || '')
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact_name || '')
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact_phone || '')
  const [celebrateBirthday, setCelebrateBirthday] = useState(profile.celebrate_birthday)
  const [celebrateAnniversary, setCelebrateAnniversary] = useState(profile.celebrate_anniversary)
  const [emailDigest, setEmailDigest] = useState(profile.email_digest_enabled)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 1048576) {
      setErrorMsg('Photo must be 1 MB or smaller')
      return
    }

    setUploading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await uploadAvatarAction(formData)
    setUploading(false)

    if (res.success && res.avatar_url) {
      setProfile((prev) => ({ ...prev, avatar_url: res.avatar_url }))
      setSuccessMsg('Profile photo updated successfully!')
    } else {
      setErrorMsg(res.error || 'Failed to upload photo')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const formData = new FormData()
    formData.append('display_name', displayName)
    formData.append('phone', phone)
    formData.append('personal_email', personalEmail)
    formData.append('dob', dob)
    formData.append('address', address)
    formData.append('emergency_contact_name', emergencyName)
    formData.append('emergency_contact_phone', emergencyPhone)
    formData.append('celebrate_birthday', String(celebrateBirthday))
    formData.append('celebrate_anniversary', String(celebrateAnniversary))
    formData.append('email_digest_enabled', String(emailDigest))

    const res = await updateMyProfileAction(formData)
    setSaving(false)

    if (res.success) {
      setSuccessMsg('Profile updated successfully!')
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg(res.error || 'Failed to update profile')
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Messages */}
      {successMsg && (
        <div className="p-4 bg-[#E6F6F2] border border-[#CCEDE5] text-[#00805F] text-xs font-semibold rounded-2xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Top Banner / Avatar Header */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="relative group shrink-0">
          <div className="w-24 h-24 rounded-full bg-[#00A57E] text-white flex items-center justify-center font-bold text-3xl overflow-hidden ring-4 ring-[#E6F6F2] shadow-sm">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.full_name}
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.full_name[0]
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-medium"
            title="Upload new photo (≤1 MB)"
          >
            <Upload className="w-5 h-5 mb-1" />
            {uploading ? 'Uploading...' : 'Change'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">
              {profile.full_name}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5] capitalize">
              {profile.role.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-[#6B7272] mt-0.5">
            {profile.job_title || 'Team Member'} · {profile.work_email}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-[#6B7272]">
            {profile.employee_id && (
              <span className="flex items-center gap-1">
                <BadgeCheck className="w-3.5 h-3.5 text-[#00A57E]" />
                ID: <strong>{profile.employee_id}</strong>
              </span>
            )}
            {profile.joining_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#6B7272]" />
                Joined: {new Date(profile.joining_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Admin-Set Locked Fields (Read-Only for staff) */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E4E7E7] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#6B7272]" />
            <h3 className="text-sm font-bold text-[#0A0A0A]">
              Company & Employment Details
            </h3>
          </div>
          <span className="text-[11px] text-[#6B7272]">Admin managed</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-[#6B7272]">Job Title</Label>
            <Input
              value={profile.job_title || 'Staff'}
              disabled
              className="mt-1 text-xs bg-[#F5F6F6] border-[#E4E7E7] text-[#0A0A0A] cursor-not-allowed"
            />
          </div>
          <div>
            <Label className="text-xs text-[#6B7272]">Employee ID</Label>
            <Input
              value={profile.employee_id || 'Not assigned'}
              disabled
              className="mt-1 text-xs bg-[#F5F6F6] border-[#E4E7E7] text-[#0A0A0A] cursor-not-allowed"
            />
          </div>
          <div>
            <Label className="text-xs text-[#6B7272]">Joining Date</Label>
            <Input
              value={profile.joining_date || 'Not recorded'}
              disabled
              className="mt-1 text-xs bg-[#F5F6F6] border-[#E4E7E7] text-[#0A0A0A] cursor-not-allowed"
            />
          </div>
          <div>
            <Label className="text-xs text-[#6B7272]">Work Email</Label>
            <Input
              value={profile.work_email || ''}
              disabled
              className="mt-1 text-xs bg-[#F5F6F6] border-[#E4E7E7] text-[#0A0A0A] cursor-not-allowed"
            />
          </div>
          <div>
            <Label className="text-xs text-[#6B7272]">System Role</Label>
            <Input
              value={profile.role}
              disabled
              className="mt-1 text-xs bg-[#F5F6F6] border-[#E4E7E7] text-[#0A0A0A] cursor-not-allowed capitalize"
            />
          </div>
        </div>
      </div>

      {/* Personal Fields (Staff Editable) */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E4E7E7] pb-3">
          <User className="w-4 h-4 text-[#00A57E]" />
          <h3 className="text-sm font-bold text-[#0A0A0A]">
            Personal & Contact Information
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="display_name" className="text-xs font-semibold text-[#0A0A0A]">
              Preferred Display Name / First Name
            </Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Fatima"
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
            <p className="text-[10px] text-[#6B7272] mt-1">Used in friendly greetings and celebration banners.</p>
          </div>

          <div>
            <Label htmlFor="phone" className="text-xs font-semibold text-[#0A0A0A]">
              Mobile Phone (E.164)
            </Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+971 50 123 4567"
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>

          <div>
            <Label htmlFor="personal_email" className="text-xs font-semibold text-[#0A0A0A]">
              Personal Email
            </Label>
            <Input
              id="personal_email"
              type="email"
              value={personalEmail}
              onChange={(e) => setPersonalEmail(e.target.value)}
              placeholder="your.personal@email.com"
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>

          <div>
            <Label htmlFor="dob" className="text-xs font-semibold text-[#0A0A0A]">
              Date of Birth
            </Label>
            <Input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
            <p className="text-[10px] text-[#6B7272] mt-1">
              🔒 Your birth year is strictly confidential and is never shown to peers.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="address" className="text-xs font-semibold text-[#0A0A0A]">
              Residential Address
            </Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Building, Street, Area, City"
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="pt-4 border-t border-[#E4E7E7] space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A0A0A]">
            <HeartHandshake className="w-4 h-4 text-rose-500" />
            Emergency Contact (Confidential)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="emergency_name" className="text-xs text-[#6B7272]">
                Contact Name
              </Label>
              <Input
                id="emergency_name"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="e.g. John Doe (Spouse / Parent)"
                className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
              />
            </div>
            <div>
              <Label htmlFor="emergency_phone" className="text-xs text-[#6B7272]">
                Contact Phone
              </Label>
              <Input
                id="emergency_phone"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+971 50 987 6543"
                className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Celebration & Notification Preferences */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E4E7E7] pb-3">
          <Sparkles className="w-4 h-4 text-[#F5C451]" />
          <h3 className="text-sm font-bold text-[#0A0A0A]">
            Celebration & Notification Preferences
          </h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]">Celebrate Birthday</p>
              <p className="text-[11px] text-[#6B7272]">
                Receive birthday wishes and see celebratory styling on your birthday. Turning this off suppresses all birthday banners and notifications about you.
              </p>
            </div>
            <Switch
              checked={celebrateBirthday}
              onCheckedChange={setCelebrateBirthday}
              className="data-[state=checked]:bg-[#00A57E]"
            />
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-t border-[#F5F6F6]">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]">Celebrate Work Anniversary</p>
              <p className="text-[11px] text-[#6B7272]">
                Celebrate your work anniversary milestones with the team. Turning this off hides anniversary notifications and banners about you.
              </p>
            </div>
            <Switch
              checked={celebrateAnniversary}
              onCheckedChange={setCelebrateAnniversary}
              className="data-[state=checked]:bg-[#00A57E]"
            />
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-t border-[#F5F6F6]">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]">Daily Email Digest</p>
              <p className="text-[11px] text-[#6B7272]">
                Receive a daily email summary of your candidates, payment notifications, and key reminders via Resend.
              </p>
            </div>
            <Switch
              checked={emailDigest}
              onCheckedChange={setEmailDigest}
              className="data-[state=checked]:bg-[#00A57E]"
            />
          </div>
        </div>
      </div>

      {/* Action Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white font-semibold text-xs px-6 py-2.5 shadow-sm transition-all"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving changes...' : 'Save Profile Changes'}
        </Button>
      </div>
    </form>
  )
}
