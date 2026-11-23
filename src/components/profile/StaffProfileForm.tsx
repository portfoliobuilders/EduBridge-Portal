'use client'

import React, { useState, useRef, useMemo } from 'react'
import Image from 'next/image'
import {
  Upload,
  Lock,
  Copy,
  Check,
  HeartHandshake,
  User,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  updateMyProfileAction,
  uploadAvatarAction,
  type StaffProfileFull,
} from '@/app/(app)/profile/actions'

interface StaffProfileFormProps {
  initialProfile: StaffProfileFull
}

function getRoleLabel(role: string): string {
  if (role === 'super_admin' || role === 'owner') return 'Super Admin'
  if (role === 'admin') return 'Admin'
  return 'Staff'
}

export function StaffProfileForm({ initialProfile }: StaffProfileFormProps) {
  const [profile, setProfile] = useState<StaffProfileFull>(initialProfile)

  // Editable fields
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [personalEmail, setPersonalEmail] = useState(profile.personal_email || '')
  const [dob, setDob] = useState(profile.dob || '')
  const [address, setAddress] = useState(profile.address || '')
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact_name || '')
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact_phone || '')

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Track unsaved changes
  const hasChanges = useMemo(() => {
    return (
      displayName !== (profile.display_name || '') ||
      phone !== (profile.phone || '') ||
      personalEmail !== (profile.personal_email || '') ||
      dob !== (profile.dob || '') ||
      address !== (profile.address || '') ||
      emergencyName !== (profile.emergency_contact_name || '') ||
      emergencyPhone !== (profile.emergency_contact_phone || '')
    )
  }, [
    displayName,
    phone,
    personalEmail,
    dob,
    address,
    emergencyName,
    emergencyPhone,
    profile,
  ])

  const handleDiscard = () => {
    setDisplayName(profile.display_name || '')
    setPhone(profile.phone || '')
    setPersonalEmail(profile.personal_email || '')
    setDob(profile.dob || '')
    setAddress(profile.address || '')
    setEmergencyName(profile.emergency_contact_name || '')
    setEmergencyPhone(profile.emergency_contact_phone || '')
    setErrorMsg(null)
  }

  const handleCopyWorkEmail = () => {
    if (!profile.work_email) return
    navigator.clipboard.writeText(profile.work_email)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

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
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg(res.error || 'Failed to upload photo')
    }
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
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

    const res = await updateMyProfileAction(formData)
    setSaving(false)

    if (res.success) {
      setProfile((prev) => ({
        ...prev,
        display_name: displayName,
        phone,
        personal_email: personalEmail,
        dob,
        address,
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone,
      }))
      setSuccessMsg('Profile updated successfully!')
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg(res.error || 'Failed to update profile')
    }
  }

  const formattedJoiningDate = profile.joining_date
    ? new Date(profile.joining_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  const displayJobTitle =
    profile.job_title?.trim() || getRoleLabel(profile.role)

  return (
    <form onSubmit={handleSave} className="space-y-6 pb-24">
      {/* Alert Messages */}
      {successMsg && (
        <div className="p-4 bg-[#E6F6F2] border border-[#CCEDE5] text-[#00805F] text-xs font-semibold rounded-2xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CARD 1: Identity Card (Merged Header & Company Details) */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs relative">
        {/* Managed by admin lock hint (top-right) */}
        <div className="absolute top-6 right-6 flex items-center gap-1.5 text-[11px] text-[#6B7272] bg-[#F5F6F6] px-2.5 py-1 rounded-full border border-[#E4E7E7]/60">
          <Lock className="w-3 h-3 text-[#6B7272]" />
          <span>Managed by admin</span>
        </div>

        {/* Top: Avatar + Identity Info */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2 sm:pt-0">
          {/* Avatar (96px) with hover overlay */}
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
              className="absolute inset-0 rounded-full bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-medium backdrop-blur-xs"
              title="Upload new photo (≤1 MB)"
              aria-label="Upload profile photo"
            >
              <Upload className="w-5 h-5 mb-1" />
              <span>{uploading ? 'Uploading...' : 'Change'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* Right details */}
          <div className="flex-1 text-center sm:text-left min-w-0 pr-0 sm:pr-32">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0A0A0A] tracking-tight">
                {profile.full_name}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F2] text-[#00805F] border border-[#CCEDE5] capitalize">
                {getRoleLabel(profile.role)}
              </span>
            </div>

            <p className="text-xs font-medium text-[#6B7272] mt-1">
              {displayJobTitle}
            </p>

            {profile.work_email && (
              <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#F5F6F6] border border-[#E4E7E7] text-xs text-[#0A0A0A]">
                <span className="truncate max-w-[220px] sm:max-w-none">{profile.work_email}</span>
                <button
                  type="button"
                  onClick={handleCopyWorkEmail}
                  className="text-[#6B7272] hover:text-[#00A57E] transition-colors p-0.5 rounded cursor-pointer"
                  title="Copy work email"
                  aria-label="Copy work email"
                >
                  {copiedEmail ? (
                    <Check className="w-3.5 h-3.5 text-[#00A57E]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-[#E4E7E7]" />

        {/* Compact 4-column definition grid of read-only pairs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3 rounded-xl bg-[#F5F6F6]/70 border border-[#E4E7E7]/60">
            <span className="text-[11px] font-medium text-[#6B7272] uppercase tracking-wider block">
              Employee ID
            </span>
            <span className="mt-1 text-xs font-semibold text-[#0A0A0A] block">
              {profile.employee_id || <span className="text-[#6B7272] font-normal">—</span>}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F6F6]/70 border border-[#E4E7E7]/60">
            <span className="text-[11px] font-medium text-[#6B7272] uppercase tracking-wider block">
              Joining Date
            </span>
            <span className="mt-1 text-xs font-semibold text-[#0A0A0A] block">
              {formattedJoiningDate || <span className="text-[#6B7272] font-normal">—</span>}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F6F6]/70 border border-[#E4E7E7]/60">
            <span className="text-[11px] font-medium text-[#6B7272] uppercase tracking-wider block">
              Reports To
            </span>
            <span className="mt-1 text-xs font-semibold text-[#0A0A0A] block truncate" title={profile.reports_to_name || undefined}>
              {profile.reports_to_name || <span className="text-[#6B7272] font-normal">—</span>}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F6F6]/70 border border-[#E4E7E7]/60">
            <span className="text-[11px] font-medium text-[#6B7272] uppercase tracking-wider block">
              System Role
            </span>
            <span className="mt-1 text-xs font-semibold text-[#0A0A0A] block capitalize">
              {getRoleLabel(profile.role)}
            </span>
          </div>
        </div>
      </div>

      {/* CARD 2: Personal & Contact (Editable) */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E4E7E7] pb-3">
          <User className="w-4 h-4 text-[#00A57E]" />
          <h3 className="font-display text-sm font-bold text-[#0A0A0A]">
            Personal & Contact
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <Label htmlFor="display_name" className="text-xs font-semibold text-[#0A0A0A]">
              Preferred Display Name / First Name
            </Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Fatima"
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
            <p className="text-[10px] text-[#6B7272] mt-1">Used in friendly greetings and team notices.</p>
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
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
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
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
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
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
            <p className="text-[10px] text-[#6B7272] mt-1">
              🔒 Birth year is never shown to peers.
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
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>
        </div>
      </div>

      {/* CARD 3: Emergency Contact (Confidential) */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E4E7E7] pb-3">
          <HeartHandshake className="w-4 h-4 text-rose-500" />
          <h3 className="font-display text-sm font-bold text-[#0A0A0A]">
            Emergency Contact (Confidential)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <Label htmlFor="emergency_name" className="text-xs font-semibold text-[#0A0A0A]">
              Contact Name
            </Label>
            <Input
              id="emergency_name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="e.g. John Doe (Spouse / Parent)"
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>
          <div>
            <Label htmlFor="emergency_phone" className="text-xs font-semibold text-[#0A0A0A]">
              Contact Phone
            </Label>
            <Input
              id="emergency_phone"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="+971 50 987 6543"
              className="mt-1.5 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>
        </div>
      </div>

      {/* STICKY BOTTOM SAVE BAR (Appears ONLY when form has unsaved changes) */}
      {hasChanges && (
        <div className="fixed bottom-0 inset-x-0 z-50 p-4 bg-white/95 backdrop-blur-md border-t border-[#E4E7E7] shadow-xl animate-in slide-in-from-bottom-4 duration-200">
          <div className="max-w-[960px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#0A0A0A]">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>You have unsaved changes</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
                className="rounded-xl border-[#E4E7E7] text-[#0A0A0A] hover:bg-[#F5F6F6] text-xs h-9 px-4 font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleSave()}
                disabled={saving}
                className="rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white text-xs h-9 px-5 font-semibold shadow-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
