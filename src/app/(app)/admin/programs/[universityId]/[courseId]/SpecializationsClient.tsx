'use client'

import React, { useState, useTransition } from 'react'
import {
  Search,
  Plus,
  BookMarked,
  Archive,
  RefreshCw,
  Edit2,
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
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { saveSpecializationAction, toggleSpecializationActiveAction } from '../../actions'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/money'

export interface SpecializationItem {
  id: string
  course_id: string
  name: string
  default_fee: number | null
  is_active: boolean
}

export function SpecializationsClient({
  courseId,
  courseName,
  courseFee,
  initialSpecializations,
}: {
  courseId: string
  courseName: string
  courseFee: number | null
  initialSpecializations: SpecializationItem[]
}) {
  const [specializations, setSpecializations] =
    useState<SpecializationItem[]>(initialSpecializations)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active')

  // Sheet state (Add / Edit)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingSpec, setEditingSpec] = useState<SpecializationItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formFee, setFormFee] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ConfirmDialog state (Archive / Restore)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<SpecializationItem | null>(null)

  // Filtered specializations
  const filtered = specializations.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false

    if (filter === 'active') return s.is_active
    if (filter === 'archived') return !s.is_active
    return true
  })

  const handleOpenAdd = () => {
    setEditingSpec(null)
    setFormName('')
    setFormFee('')
    setFormError(null)
    setSheetOpen(true)
  }

  const handleOpenEdit = (spec: SpecializationItem) => {
    setEditingSpec(spec)
    setFormName(spec.name)
    setFormFee(spec.default_fee !== null ? spec.default_fee.toFixed(2) : '')
    setFormError(null)
    setSheetOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('Specialization name is required')
      return
    }

    if (formFee && !/^\d+(\.\d{1,2})?$/.test(formFee.trim())) {
      setFormError('Default fee must be a valid number with up to 2 decimal places')
      return
    }

    // Inline case-insensitive duplicate check within course
    const isDup = specializations.some(
      (s) =>
        s.id !== editingSpec?.id &&
        s.name.trim().toLowerCase() === formName.trim().toLowerCase()
    )
    if (isDup) {
      setFormError(`A specialization named "${formName.trim()}" already exists in this course.`)
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      if (editingSpec) formData.append('id', editingSpec.id)
      formData.append('course_id', courseId)
      formData.append('name', formName.trim())
      if (formFee.trim()) formData.append('default_fee', formFee.trim())

      const res = await saveSpecializationAction(formData)
      if (res.success) {
        toast.success(editingSpec ? 'Specialization updated' : 'Specialization added')
        setSheetOpen(false)
        window.location.reload()
      } else {
        setFormError(res.error ?? 'Failed to save specialization')
        toast.error(res.error ?? 'Failed to save specialization')
      }
    })
  }

  const handleToggleArchive = (spec: SpecializationItem) => {
    setConfirmTarget(spec)
    setConfirmOpen(true)
  }

  const handleConfirmToggle = async () => {
    if (!confirmTarget) return
    const nextState = !confirmTarget.is_active
    const res = await toggleSpecializationActiveAction(confirmTarget.id, nextState)
    if (res.success) {
      toast.success(
        nextState ? `Restored "${confirmTarget.name}"` : `Archived "${confirmTarget.name}"`
      )
      setSpecializations((prev) =>
        prev.map((s) => (s.id === confirmTarget.id ? { ...s, is_active: nextState } : s))
      )
    } else {
      toast.error(res.error ?? 'Operation failed')
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
              placeholder="Search specializations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-border text-xs">
            <button
              type="button"
              onClick={() => setFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filter === 'active'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setFilter('archived')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filter === 'archived'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Archived
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filter === 'all'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
          </div>

          <Button
            onClick={handleOpenAdd}
            className="h-10 px-4 rounded-xl gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Specialization
          </Button>
        </div>
      </div>

      {/* Specializations list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <BookMarked className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-foreground mb-1">
            No specializations found
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
            {search
              ? 'No specializations match your search query.'
              : `No major tracks or specializations have been added to ${courseName} yet.`}
          </p>
          <Button onClick={handleOpenAdd} variant="outline" className="rounded-xl">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Specialization
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden shadow-xs">
          {filtered.map((spec) => (
            <div
              key={spec.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
            >
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <BookMarked className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-foreground truncate">
                      {spec.name}
                    </span>
                    {!spec.is_active && (
                      <Badge variant="secondary" className="text-[11px] bg-neutral-200 text-neutral-700">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {spec.default_fee !== null ? (
                      <span className="font-semibold text-foreground font-mono tabular-nums">
                        {formatMoney(spec.default_fee)}{' '}
                        <span className="font-normal text-muted-foreground text-[11px]">(Track fee)</span>
                      </span>
                    ) : courseFee !== null ? (
                      <span className="text-muted-foreground">
                        Inherits course fee ({formatMoney(courseFee)})
                      </span>
                    ) : (
                      <span>No fee set</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(spec)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleArchive(spec)}
                  className={`h-8 px-2.5 text-xs rounded-lg ${
                    spec.is_active
                      ? 'text-muted-foreground hover:text-destructive'
                      : 'text-primary hover:text-primary/80'
                  }`}
                >
                  {spec.is_active ? (
                    <>
                      <Archive className="w-3.5 h-3.5 mr-1" />
                      Archive
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      Restore
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md w-full">
          <form onSubmit={handleSave} className="flex flex-col h-full">
            <SheetHeader>
              <SheetTitle>
                {editingSpec ? 'Edit Specialization' : 'Add Specialization'}
              </SheetTitle>
              <SheetDescription>
                {editingSpec
                  ? `Update specialization details for ${courseName}.`
                  : `Add a specialization / track to ${courseName}.`}
              </SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-4 flex-1">
              {formError && (
                <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="spec-name" className="text-xs font-semibold">
                  Specialization Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="spec-name"
                  placeholder="e.g. Artificial Intelligence, Marketing, Cyber Security"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-10 rounded-xl"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="spec-fee" className="text-xs font-semibold">
                  Default Fee Override (AED) — before VAT treatment
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                    AED
                  </span>
                  <Input
                    id="spec-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={courseFee !== null ? courseFee.toFixed(2) : '0.00'}
                    value={formFee}
                    onChange={(e) => setFormFee(e.target.value)}
                    className="pl-12 h-10 rounded-xl font-mono tabular-nums"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to inherit course default fee ({courseFee !== null ? formatMoney(courseFee) : 'None'}). Base tuition before VAT treatment.
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
                {isPending ? 'Saving...' : editingSpec ? 'Update Specialization' : 'Add Specialization'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Archive / Restore Confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirmTarget?.is_active
            ? `Archive "${confirmTarget?.name}"?`
            : `Restore "${confirmTarget?.name}"?`
        }
        description={
          confirmTarget?.is_active
            ? `Archiving "${confirmTarget?.name}" hides it from staff specialization pickers.`
            : `Restoring "${confirmTarget?.name}" makes it available again in staff pickers.`
        }
        confirmLabel={confirmTarget?.is_active ? 'Archive Specialization' : 'Restore Specialization'}
        isDestructive={confirmTarget?.is_active}
        onConfirm={handleConfirmToggle}
      />
    </div>
  )
}
