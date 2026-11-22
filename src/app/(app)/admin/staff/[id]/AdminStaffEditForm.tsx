'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  User,
  Save,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateStaffAction } from '../actions'

export function AdminStaffEditForm({
  staff,
  managers,
  attendanceSettings,
  offices = [],
}: {
  staff: any
  managers: any[]
  attendanceSettings?: any
  offices?: any[]
}) {
  const router = useRouter()
  const [jobTitle, setJobTitle] = useState(staff.job_title || '')
  const [employeeId, setEmployeeId] = useState(staff.employee_id || '')
  const [joiningDate, setJoiningDate] = useState(staff.joining_date || '')
  const [role, setRole] = useState(staff.role || 'staff')
  const [reportsTo, setReportsTo] = useState(staff.reports_to || '')
  const [adminScope, setAdminScope] = useState(staff.admin_scope || 'team')
  const [isActive, setIsActive] = useState(Boolean(staff.is_active))

  // Attendance Settings
  const [officeId, setOfficeId] = useState(attendanceSettings?.office_id || (offices[0]?.id || ''))
  const [shiftStart, setShiftStart] = useState(attendanceSettings?.shift_start?.substring(0, 5) || '09:00')
  const [shiftEnd, setShiftEnd] = useState(attendanceSettings?.shift_end?.substring(0, 5) || '18:00')
  const [graceMinutes, setGraceMinutes] = useState(attendanceSettings?.grace_minutes ?? 15)
  const [attendanceRequired, setAttendanceRequired] = useState(attendanceSettings?.attendance_required ?? true)
  const [allowFieldPunch, setAllowFieldPunch] = useState(attendanceSettings?.allow_field_punch ?? false)

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const formData = new FormData()
    formData.append('userId', staff.id)
    formData.append('name', staff.full_name || '')
    if (staff.phone) {
      formData.append('phone', staff.phone)
    }
    formData.append('job_title', jobTitle)
    formData.append('employee_id', employeeId)
    formData.append('joining_date', joiningDate)
    formData.append('role', role)
    formData.append('reports_to', reportsTo)
    formData.append('admin_scope', adminScope)
    formData.append('is_active', String(isActive))

    // Attendance Settings
    formData.append('office_id', officeId)
    formData.append('shift_start', `${shiftStart}:00`)
    formData.append('shift_end', `${shiftEnd}:00`)
    formData.append('grace_minutes', String(graceMinutes))
    formData.append('attendance_required', String(attendanceRequired))
    formData.append('allow_field_punch', String(allowFieldPunch))

    const res = await updateStaffAction(formData)
    setSaving(false)

    if (res.success) {
      setSuccess('Staff record updated successfully!')
      router.refresh()
      setTimeout(() => setSuccess(null), 3000)
    } else {
      setError(res.error || 'Failed to update staff record')
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {success && (
        <div className="p-4 bg-[#E6F6F2] border border-[#CCEDE5] text-[#00805F] text-xs font-semibold rounded-2xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Admin Managed Employment Settings */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E4E7E7] pb-3">
          <ShieldCheck className="w-4 h-4 text-[#00A57E]" />
          <h2 className="text-sm font-bold text-[#0A0A0A]">
            Employment & Access Settings
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="employee_id" className="text-xs font-semibold text-[#0A0A0A]">
              Employee ID (Unique)
            </Label>
            <Input
              id="employee_id"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. EB-EMP-001"
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>

          <div>
            <Label htmlFor="job_title" className="text-xs font-semibold text-[#0A0A0A]">
              Job Title
            </Label>
            <Input
              id="job_title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Admissions Counsellor"
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>

          <div>
            <Label htmlFor="joining_date" className="text-xs font-semibold text-[#0A0A0A]">
              Joining Date
            </Label>
            <Input
              id="joining_date"
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              className="mt-1 text-xs rounded-xl border-[#E4E7E7] focus-visible:ring-[#00A57E]"
            />
          </div>

          <div>
            <Label htmlFor="role" className="text-xs font-semibold text-[#0A0A0A]">
              System Role
            </Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-[#E4E7E7] bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          {role === 'admin' && (
            <div>
              <Label htmlFor="admin_scope" className="text-xs font-semibold text-[#0A0A0A]">
                Admin Scope
              </Label>
              <select
                id="admin_scope"
                value={adminScope}
                onChange={(e) => setAdminScope(e.target.value)}
                className="mt-1 w-full h-9 rounded-xl border border-[#E4E7E7] bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20"
              >
                <option value="team">Team (Own Reports Only)</option>
                <option value="company">Company (All Staff)</option>
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="reports_to" className="text-xs font-semibold text-[#0A0A0A]">
              Reports To (Manager)
            </Label>
            <select
              id="reports_to"
              value={reportsTo}
              onChange={(e) => setReportsTo(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-[#E4E7E7] bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A57E]/20"
            >
              <option value="">None (Top Level)</option>
              {managers
                .filter((m) => m.id !== staff.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.role})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-[#F5F6F6]">
          <div>
            <p className="text-xs font-semibold text-[#0A0A0A]">Active Account Status</p>
            <p className="text-[11px] text-[#6B7272]">
              Inactive staff cannot sign in or record payments.
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            className="data-[state=checked]:bg-[#00A57E]"
          />
        </div>
      </div>

      {/* Attendance & Geofencing Settings */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E4E7E7] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00A57E]" />
            <h2 className="text-sm font-bold text-[#0A0A0A]">
              Attendance & Geofencing Parameters
            </h2>
          </div>
          <span className="text-[10px] text-[#00805F] bg-[#E6F6F2] px-2 py-0.5 rounded-full border border-[#CCEDE5] font-semibold">
            Attendance Settings
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="staff-office" className="text-xs font-semibold text-[#0A0A0A]">
              Assigned Office
            </Label>
            <select
              id="staff-office"
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E4E7E7] bg-white px-3 py-2 text-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#00A57E]"
            >
              {offices.map((off) => (
                <option key={off.id} value={off.id}>
                  {off.name} ({off.radius_m}m radius)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-shift-start" className="text-xs font-semibold text-[#0A0A0A]">
              Shift Start Time
            </Label>
            <Input
              id="staff-shift-start"
              type="time"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              className="text-xs rounded-xl border-[#E4E7E7]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-shift-end" className="text-xs font-semibold text-[#0A0A0A]">
              Shift End Time
            </Label>
            <Input
              id="staff-shift-end"
              type="time"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              className="text-xs rounded-xl border-[#E4E7E7]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-grace" className="text-xs font-semibold text-[#0A0A0A]">
              Grace Period (Minutes)
            </Label>
            <Input
              id="staff-grace"
              type="number"
              min="0"
              max="120"
              value={graceMinutes}
              onChange={(e) => setGraceMinutes(parseInt(e.target.value, 10) || 0)}
              className="text-xs rounded-xl border-[#E4E7E7]"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-[#F5F6F6] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/50">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]">Attendance Tracking Required</p>
              <p className="text-[11px] text-[#6B7272]">
                Disable for executive/owner/support roles exempt from daily punching.
              </p>
            </div>
            <Switch
              checked={attendanceRequired}
              onCheckedChange={setAttendanceRequired}
              className="data-[state=checked]:bg-[#00A57E]"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#E4E7E7] bg-[#F5F6F6]/50">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]">Allow Field Punch (BDM)</p>
              <p className="text-[11px] text-[#6B7272]">
                Allows punching outside geofence with note (requires admin approval).
              </p>
            </div>
            <Switch
              checked={allowFieldPunch}
              onCheckedChange={setAllowFieldPunch}
              className="data-[state=checked]:bg-[#00A57E]"
            />
          </div>
        </div>
      </div>

      {/* Sensitive Profile Fields (Visible to Admin in Scope via RLS) */}
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E4E7E7] pb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#6B7272]" />
            <h2 className="text-sm font-bold text-[#0A0A0A]">
              Personal Information & Emergency Contact
            </h2>
          </div>
          <span className="text-[10px] text-[#6B7272] bg-[#F5F6F6] px-2 py-0.5 rounded-full border border-[#E4E7E7]">
            Confidential
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-[#6B7272] block">Full Name:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.full_name}</span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Display Name:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.display_name || '—'}</span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Phone:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.phone || '—'}</span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Personal Email:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.personal_email || '—'}</span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Date of Birth:</span>
            <span className="font-semibold text-[#0A0A0A]">
              {staff.dob ? new Date(staff.dob).toLocaleDateString('en-GB') : '—'}
            </span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Residential Address:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.address || '—'}</span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Emergency Contact Name:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.emergency_contact_name || '—'}</span>
          </div>

          <div>
            <span className="text-[#6B7272] block">Emergency Contact Phone:</span>
            <span className="font-semibold text-[#0A0A0A]">{staff.emergency_contact_phone || '—'}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white font-semibold text-xs px-6 py-2.5 shadow-sm"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving changes...' : 'Save Staff Record'}
        </Button>
      </div>
    </form>
  )
}
