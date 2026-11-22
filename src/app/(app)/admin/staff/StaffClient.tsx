'use client'

import React, { useState, useTransition } from 'react'
import {
  UserPlus,
  Search,
  Phone,
  Calendar,
  RotateCw,
  Power,
  Users,
  Network,
  Edit2,
  Briefcase,
  Layers,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RoleBadge } from '@/components/RoleBadge'
import {
  inviteStaffAction,
  updateStaffAction,
  toggleStaffRoleAction,
  toggleStaffActiveAction,
} from './actions'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/money'
import { format } from 'date-fns'

export interface StaffMember {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'super_admin' | 'admin' | 'staff' | 'owner'
  job_title: string | null
  reports_to: string | null
  reports_to_name: string | null
  admin_scope: 'team' | 'company' | string
  is_support: boolean
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
  collections_this_month: number
}

export interface JobTitleOption {
  id: string
  name: string
}

export function StaffClient({
  initialStaff,
  currentUserId,
  currentUserRole,
  jobTitles,
}: {
  initialStaff: StaffMember[]
  currentUserId: string
  currentUserRole: string
  jobTitles: JobTitleOption[]
}) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'super_admin' | 'admin' | 'staff'>('all')
  const [jobTitleFilter, setJobTitleFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'all' | 'team'>('all')

  // Sheet state: mode can be 'invite' or 'edit'
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<'super_admin' | 'admin' | 'staff'>('staff')
  const [formJobTitle, setFormJobTitle] = useState<string>('')
  const [formReportsTo, setFormReportsTo] = useState<string>('none')
  const [formAdminScope, setFormAdminScope] = useState<'team' | 'company'>('team')
  const [formIsSupport, setFormIsSupport] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ConfirmDialog state (Active Toggle / Role Toggle)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<StaffMember | null>(null)
  const [confirmActionType, setConfirmActionType] = useState<'toggle_active' | 'toggle_role'>('toggle_active')

  const isSuperAdmin = currentUserRole === 'super_admin' || currentUserRole === 'owner'

  // Potential managers for reports_to
  const managerOptions = staffList.filter((s) => {
    if (editingMember && s.id === editingMember.id) return false
    return s.is_active
  })

  // Filtered staff list
  const filtered = staffList.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search)) ||
      (s.job_title && s.job_title.toLowerCase().includes(search.toLowerCase()))
    if (!matchesSearch) return false

    if (roleFilter !== 'all') {
      const normalizedRole = s.role === 'owner' ? 'super_admin' : s.role
      if (normalizedRole !== roleFilter) return false
    }

    if (jobTitleFilter !== 'all') {
      if (s.job_title !== jobTitleFilter) return false
    }

    if (activeTab === 'team') {
      // My team: direct or indirect reports, or self
      return s.reports_to === currentUserId || s.id === currentUserId
    }

    return true
  })

  const myTeamCount = staffList.filter((s) => s.reports_to === currentUserId || s.id === currentUserId).length

  const handleOpenInvite = () => {
    setEditingMember(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormRole('staff')
    setFormJobTitle('')
    setFormReportsTo(isSuperAdmin ? 'none' : currentUserId)
    setFormAdminScope('team')
    setFormIsSupport(false)
    setFormError(null)
    setSheetOpen(true)
  }

  const handleOpenEdit = (member: StaffMember) => {
    setEditingMember(member)
    setFormName(member.full_name)
    setFormEmail(member.email)
    setFormPhone(member.phone || '')
    setFormRole(member.role === 'owner' ? 'super_admin' : (member.role as 'super_admin' | 'admin' | 'staff'))
    setFormJobTitle(member.job_title || '')
    setFormReportsTo(member.reports_to || 'none')
    setFormAdminScope((member.admin_scope as 'team' | 'company') || 'team')
    setFormIsSupport(member.is_support)
    setFormError(null)
    setSheetOpen(true)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('Full name is required')
      return
    }

    if (!editingMember && (!formEmail.trim() || !formEmail.includes('@'))) {
      setFormError('A valid email address is required')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append('name', formName.trim())
      if (formPhone.trim()) formData.append('phone', formPhone.trim())
      formData.append('role', formRole)
      if (formJobTitle) formData.append('job_title', formJobTitle)
      if (formReportsTo && formReportsTo !== 'none') {
        formData.append('reports_to', formReportsTo)
      }
      formData.append('admin_scope', formAdminScope)
      formData.append('is_support', String(formIsSupport))

      if (editingMember) {
        formData.append('userId', editingMember.id)
        formData.append('is_active', String(editingMember.is_active))
        const res = await updateStaffAction(formData)
        if (res.success) {
          toast.success(`Updated details for ${formName.trim()}`)
          setSheetOpen(false)
          window.location.reload()
        } else {
          setFormError(res.error ?? 'Failed to update staff member')
          toast.error(res.error ?? 'Failed to update staff member')
        }
      } else {
        formData.append('email', formEmail.trim().toLowerCase())
        const res = await inviteStaffAction(formData)
        if (res.success) {
          toast.success(`Invitation sent to ${formEmail.trim()}`)
          setSheetOpen(false)
          window.location.reload()
        } else {
          setFormError(res.error ?? 'Failed to invite staff member')
          toast.error(res.error ?? 'Failed to invite staff member')
        }
      }
    })
  }

  const handleInitiateActiveToggle = (member: StaffMember) => {
    setConfirmTarget(member)
    setConfirmActionType('toggle_active')
    setConfirmOpen(true)
  }

  const handleInitiateRoleToggle = (member: StaffMember) => {
    setConfirmTarget(member)
    setConfirmActionType('toggle_role')
    setConfirmOpen(true)
  }

  const handleExecuteConfirmedAction = async () => {
    if (!confirmTarget) return

    if (confirmActionType === 'toggle_active') {
      const nextActive = !confirmTarget.is_active
      const res = await toggleStaffActiveAction(confirmTarget.id, nextActive)
      if (res.success) {
        toast.success(
          nextActive
            ? `Reactivated ${confirmTarget.full_name}`
            : `Deactivated ${confirmTarget.full_name}`
        )
        setStaffList((prev) =>
          prev.map((s) => (s.id === confirmTarget.id ? { ...s, is_active: nextActive } : s))
        )
      } else {
        toast.error(res.error ?? 'Failed to change staff status')
      }
    } else if (confirmActionType === 'toggle_role') {
      const currentNorm = confirmTarget.role === 'owner' ? 'super_admin' : confirmTarget.role
      const nextRole: 'super_admin' | 'admin' | 'staff' =
        currentNorm === 'super_admin' ? 'admin' : currentNorm === 'admin' ? 'staff' : 'admin'

      const res = await toggleStaffRoleAction(confirmTarget.id, nextRole)
      if (res.success) {
        toast.success(`Role changed to ${nextRole} for ${confirmTarget.full_name}`)
        setStaffList((prev) =>
          prev.map((s) => (s.id === confirmTarget.id ? { ...s, role: nextRole } : s))
        )
      } else {
        toast.error(res.error ?? 'Failed to update role')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* View Tabs: All Staff vs My Team */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'all'
              ? 'bg-primary text-white shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
          }`}
        >
          <Users className="w-4 h-4" />
          All Staff ({staffList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('team')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'team'
              ? 'bg-primary text-white shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
          }`}
        >
          <Network className="w-4 h-4" />
          My Team ({myTeamCount})
        </button>
      </div>

      {/* Top action and filter bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, email, phone, or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl"
            />
          </div>

          {/* Role filter */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-border text-xs shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                roleFilter === 'all'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Roles
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('super_admin')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                roleFilter === 'super_admin'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Super Admins
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                roleFilter === 'admin'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Admins
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('staff')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                roleFilter === 'staff'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Staff
            </button>
          </div>

          {/* Job Title filter */}
          {jobTitles.length > 0 && (
            <Select value={jobTitleFilter} onValueChange={(val) => setJobTitleFilter(val || 'all')}>
              <SelectTrigger className="h-10 w-[160px] rounded-xl text-xs bg-white shrink-0">
                <SelectValue placeholder="Job Title" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Titles</SelectItem>
                {jobTitles.map((jt) => (
                  <SelectItem key={jt.id} value={jt.name}>
                    {jt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Button
          onClick={handleOpenInvite}
          className="h-10 px-4 rounded-xl gap-2 font-medium shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add Staff
        </Button>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Job Title</th>
                <th className="py-3.5 px-4">Role & Scope</th>
                <th className="py-3.5 px-4">Reports To</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Last Sign-In</th>
                <th className="py-3.5 px-4 text-right">Collections (Month)</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    No staff members match the selected criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((member) => {
                  const isSelf = member.id === currentUserId
                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-neutral-50/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#E6F6F2] text-[#00A57E] font-semibold flex items-center justify-center shrink-0 text-xs">
                            {member.full_name
                              .split(' ')
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-foreground text-sm">
                                {member.full_name}
                              </span>
                              {isSelf && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/30">
                                  You
                                </Badge>
                              )}
                              {member.is_support && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] py-0 px-1.5">
                                  Support
                                </Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground text-xs block">
                              {member.email}
                            </span>
                            {member.phone && (
                              <span className="text-muted-foreground/80 text-[11px] flex items-center gap-1 mt-0.5">
                                <Phone className="w-2.5 h-2.5" />
                                {member.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-foreground font-medium">
                        {member.job_title ? (
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                            <span>{member.job_title}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <RoleBadge role={member.role} />
                          {member.role === 'admin' && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Layers className="w-2.5 h-2.5" />
                              <span className="capitalize">{member.admin_scope} scope</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">
                        {member.reports_to_name ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-foreground">{member.reports_to_name}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {member.is_active ? (
                          <Badge variant="outline" className="text-[11px] border-green-200 bg-green-50 text-green-700 font-medium">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px] bg-neutral-200 text-neutral-600">
                            Inactive
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">
                        {member.last_sign_in_at ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-muted-foreground/70" />
                            <span>{format(new Date(member.last_sign_in_at), 'dd MMM yyyy, HH:mm')}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">Never signed in</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-foreground tabular-nums text-sm">
                        {formatMoney(member.collections_this_month)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(member)}
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                            title="Edit details"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>

                          {isSuperAdmin && !isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleInitiateRoleToggle(member)}
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                              title="Cycle role"
                            >
                              <RotateCw className="w-3.5 h-3.5 mr-1" />
                              Role
                            </Button>
                          )}

                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleInitiateActiveToggle(member)}
                              className={`h-8 px-2 text-xs rounded-lg ${
                                member.is_active
                                  ? 'text-muted-foreground hover:text-destructive'
                                  : 'text-primary hover:text-primary/80'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5 mr-1" />
                              {member.is_active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-[480px] w-full">
          <form onSubmit={handleFormSubmit} className="flex flex-col h-full">
            <SheetHeader>
              <SheetTitle>{editingMember ? 'Edit Staff Member' : 'Add Staff Member'}</SheetTitle>
              <SheetDescription>
                {editingMember
                  ? 'Update job title, reporting hierarchy, and team permissions.'
                  : 'Invite a new team member. An email with a secure link will be sent to set their password.'}
              </SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-4 flex-1 overflow-y-auto pr-1">
              {formError && (
                <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs space-y-1">
                  <span className="font-medium">{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="staff-name" className="text-xs font-semibold">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="staff-name"
                  placeholder="e.g. Sarah Khan"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-xl h-10"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-email" className="text-xs font-semibold">
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="staff-email"
                  type="email"
                  placeholder="s.khan@edubridge.ae"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="rounded-xl h-10"
                  required
                  disabled={Boolean(editingMember)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-phone" className="text-xs font-semibold">
                  Phone Number
                </Label>
                <Input
                  id="staff-phone"
                  placeholder="+971 50 123 4567"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="rounded-xl h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-role" className="text-xs font-semibold">
                  System Role <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formRole}
                  onValueChange={(val) => setFormRole(val as 'super_admin' | 'admin' | 'staff')}
                  disabled={!isSuperAdmin}
                >
                  <SelectTrigger id="staff-role" className="h-10 rounded-xl text-xs">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && (
                      <SelectItem value="super_admin">Super Admin (Full Access)</SelectItem>
                    )}
                    {isSuperAdmin && (
                      <SelectItem value="admin">Admin (Team Lead / Department)</SelectItem>
                    )}
                    <SelectItem value="staff">Staff (Admission Counsellor)</SelectItem>
                  </SelectContent>
                </Select>
                {!isSuperAdmin && (
                  <p className="text-[11px] text-muted-foreground">
                    Admins can only manage and invite Staff counsellors.
                  </p>
                )}
              </div>

              {/* Admin Scope (visible only when role is admin) */}
              {formRole === 'admin' && (
                <div className="space-y-1.5 p-3 rounded-xl bg-[#F5F6F6] border border-border">
                  <Label htmlFor="admin-scope" className="text-xs font-semibold">
                    Admin Access Scope
                  </Label>
                  <Select
                    value={formAdminScope}
                    onValueChange={(val) => setFormAdminScope(val as 'team' | 'company')}
                    disabled={!isSuperAdmin}
                  >
                    <SelectTrigger id="admin-scope" className="h-10 rounded-xl text-xs bg-white">
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team">Team (Direct & indirect reports)</SelectItem>
                      <SelectItem value="company">Company (All staff members)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Team scope restricts dashboards, reports, and staff management to subordinates in their reporting chain.
                  </p>
                </div>
              )}

              {/* Job Title */}
              <div className="space-y-1.5">
                <Label htmlFor="staff-job-title" className="text-xs font-semibold">
                  Job Title
                </Label>
                <Select
                  value={formJobTitle || 'none'}
                  onValueChange={(val) => setFormJobTitle(val === 'none' ? '' : (val || ''))}
                >
                  <SelectTrigger id="staff-job-title" className="h-10 rounded-xl text-xs">
                    <SelectValue placeholder="Select Job Title" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific title</SelectItem>
                    {jobTitles.map((jt) => (
                      <SelectItem key={jt.id} value={jt.name}>
                        {jt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reports To (Hierarchy / Team Lead) */}
              <div className="space-y-1.5">
                <Label htmlFor="staff-reports-to" className="text-xs font-semibold">
                  Reports To (Manager / Team Lead)
                </Label>
                <Select
                  value={formReportsTo}
                  onValueChange={(val) => setFormReportsTo(val || 'none')}
                >
                  <SelectTrigger id="staff-reports-to" className="h-10 rounded-xl text-xs">
                    <SelectValue placeholder="Select reporting manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Direct Super Admin)</SelectItem>
                    {managerOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name} ({m.role === 'owner' ? 'Super Admin' : m.role === 'admin' ? 'Admin' : 'Staff'}{m.job_title ? ` · ${m.job_title}` : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Emergency Support Account toggle (Super Admin only) */}
              {isSuperAdmin && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border border-border bg-[#F5F6F6]">
                    <input
                      type="checkbox"
                      checked={formIsSupport}
                      onChange={(e) => setFormIsSupport(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                    />
                    <div className="text-xs">
                      <span className="font-semibold block text-foreground">Emergency Support Account</span>
                      <span className="text-muted-foreground text-[11px]">
                        Account is gated by the company settings emergency support switch.
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </div>

            <SheetFooter className="pt-4 border-t border-border flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
                className="border-[#E4E7E7]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-[#00A57E] hover:bg-[#00805F] text-white min-w-[140px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    <span>Saving...</span>
                  </>
                ) : (
                  editingMember ? 'Update Staff Member' : 'Send Invitation'
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog for Deactivate / Reactivate / Role Switch */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirmActionType === 'toggle_active'
            ? confirmTarget?.is_active
              ? `Deactivate ${confirmTarget?.full_name}?`
              : `Reactivate ${confirmTarget?.full_name}?`
            : `Change Role for ${confirmTarget?.full_name}?`
        }
        description={
          confirmActionType === 'toggle_active'
            ? confirmTarget?.is_active
              ? 'This staff member will immediately lose access to sign in and record payments.'
              : 'This staff member will regain access to sign in and use the application.'
            : `Are you sure you want to change the role of ${confirmTarget?.full_name}?`
        }
        confirmLabel={
          confirmActionType === 'toggle_active'
            ? confirmTarget?.is_active
              ? 'Deactivate Staff'
              : 'Reactivate Staff'
            : 'Change Role'
        }
        isDestructive={Boolean(confirmActionType === 'toggle_active' && confirmTarget?.is_active)}
        onConfirm={handleExecuteConfirmedAction}
      />
    </div>
  )
}
