'use client'

import React, { useState, useTransition } from 'react'
import {
  UserPlus,
  Shield,
  User,
  Search,
  Phone,
  Calendar,
  AlertTriangle,
  RotateCw,
  Power,
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
import {
  inviteStaffAction,
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
  role: 'owner' | 'staff'
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
  collections_this_month: number
}

export function StaffClient({
  initialStaff,
  currentUserId,
}: {
  initialStaff: StaffMember[]
  currentUserId: string
}) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'staff'>('all')

  // Sheet state (Invite Staff)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<'staff' | 'owner'>('staff')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ConfirmDialog state (Active Toggle / Role Toggle)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<StaffMember | null>(null)
  const [confirmActionType, setConfirmActionType] = useState<'toggle_active' | 'toggle_role'>('toggle_active')

  const filtered = staffList.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search))
    if (!matchesSearch) return false

    if (roleFilter === 'owner') return s.role === 'owner'
    if (roleFilter === 'staff') return s.role === 'staff'
    return true
  })

  const handleOpenInvite = () => {
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormRole('staff')
    setFormError(null)
    setSheetOpen(true)
  }

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('Full name is required')
      return
    }

    if (!formEmail.trim() || !formEmail.includes('@')) {
      setFormError('A valid email address is required')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append('name', formName.trim())
      formData.append('email', formEmail.trim().toLowerCase())
      if (formPhone.trim()) formData.append('phone', formPhone.trim())
      formData.append('role', formRole)

      const res = await inviteStaffAction(formData)
      if (res.success) {
        toast.success(`Invitation sent to ${formEmail.trim()}`)
        setSheetOpen(false)
        window.location.reload()
      } else {
        setFormError(res.error ?? 'Failed to invite staff member')
        toast.error(res.error ?? 'Failed to invite staff member')
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
        // Show SQL trigger error message verbatim
        toast.error(res.error ?? 'Failed to change staff status')
      }
    } else if (confirmActionType === 'toggle_role') {
      const nextRole: 'staff' | 'owner' = confirmTarget.role === 'owner' ? 'staff' : 'owner'
      const res = await toggleStaffRoleAction(confirmTarget.id, nextRole)
      if (res.success) {
        toast.success(`Role changed to ${nextRole} for ${confirmTarget.full_name}`)
        setStaffList((prev) =>
          prev.map((s) => (s.id === confirmTarget.id ? { ...s, role: nextRole } : s))
        )
      } else {
        // Show SQL trigger error message verbatim
        toast.error(res.error ?? 'Failed to update role')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search staff by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Role filter */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-border text-xs">
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
              onClick={() => setRoleFilter('owner')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                roleFilter === 'owner'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Owners
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

          <Button
            onClick={handleOpenInvite}
            className="h-10 px-4 rounded-xl gap-2 font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Add Staff
          </Button>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Last Sign-In</th>
                <th className="py-3.5 px-4 text-right">Collections This Month</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((member) => {
                const isSelf = member.id === currentUserId
                return (
                  <tr
                    key={member.id}
                    className="hover:bg-neutral-50/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-neutral-100 text-foreground font-semibold flex items-center justify-center shrink-0 text-xs">
                          {member.full_name
                            .split(' ')
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground text-sm">
                              {member.full_name}
                            </span>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/30">
                                You
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {member.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-muted-foreground">
                      {member.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-muted-foreground/70" />
                          <span>{member.phone}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-400">None</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {member.role === 'owner' ? (
                        <Badge className="bg-[#00A57E] text-white hover:bg-[#00805F] border-none text-[11px] gap-1">
                          <Shield className="w-3 h-3" />
                          Owner
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-neutral-700 bg-neutral-100 border-neutral-200">
                          <User className="w-3 h-3 mr-1 text-muted-foreground" />
                          Staff
                        </Badge>
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
                          onClick={() => handleInitiateRoleToggle(member)}
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                          title={`Switch to ${member.role === 'owner' ? 'Staff' : 'Owner'}`}
                        >
                          <RotateCw className="w-3.5 h-3.5 mr-1" />
                          {member.role === 'owner' ? 'Make Staff' : 'Make Owner'}
                        </Button>

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
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md w-full">
          <form onSubmit={handleInviteSubmit} className="flex flex-col h-full">
            <SheetHeader>
              <SheetTitle>Add Staff Member</SheetTitle>
              <SheetDescription>
                Invite a new team member. An email with a secure link will be sent to their email
                address allowing them to set their own password.
              </SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-4 flex-1">
              {formError && (
                <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Invite Failed
                  </div>
                  <p>{formError}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="staff-name" className="text-xs font-semibold">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="staff-name"
                  placeholder="e.g. Sarah Ahmed"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-10 rounded-xl"
                  autoFocus
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
                  placeholder="sarah@edubridgeeducation.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="h-10 rounded-xl"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  The invitation and password setup link will be dispatched here.
                </p>
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
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-role" className="text-xs font-semibold">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formRole}
                  onValueChange={(val) => { if (val) setFormRole(val as 'staff' | 'owner') }}
                >
                  <SelectTrigger id="staff-role" className="h-10 rounded-xl">
                    <SelectValue placeholder="Select user role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff (Admissions Counsellor)</SelectItem>
                    <SelectItem value="owner">Owner (Full Admin Access)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Staff members can manage students, enrollments, and payments. Owners can also access
                  admin settings, programs, reports, and void vouchers.
                </p>
              </div>
            </div>

            <SheetFooter className="gap-2 sm:gap-0 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
                className="rounded-xl h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl h-10 font-semibold"
              >
                {isPending ? 'Sending Invite...' : 'Send Invitation'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirmActionType === 'toggle_active'
            ? confirmTarget?.is_active
              ? `Deactivate ${confirmTarget?.full_name}?`
              : `Reactivate ${confirmTarget?.full_name}?`
            : `Change role to ${confirmTarget?.role === 'owner' ? 'Staff' : 'Owner'} for ${confirmTarget?.full_name}?`
        }
        description={
          confirmActionType === 'toggle_active'
            ? confirmTarget?.is_active
              ? `Deactivating ${confirmTarget?.full_name} will immediately revoke their access to the application. If this is the only active owner, the database will block this action.`
              : `Reactivating ${confirmTarget?.full_name} will allow them to log in again.`
            : `Changing role will update their access permissions across the system immediately.`
        }
        confirmLabel={
          confirmActionType === 'toggle_active'
            ? confirmTarget?.is_active
              ? 'Deactivate'
              : 'Reactivate'
            : 'Update Role'
        }
        isDestructive={confirmActionType === 'toggle_active' && confirmTarget?.is_active}
        onConfirm={handleExecuteConfirmedAction}
      />
    </div>
  )
}
