'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  Building2,
  ChevronRight,
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
import { saveUniversityAction, toggleUniversityActiveAction } from './actions'
import { toast } from 'sonner'

export interface UniversityItem {
  id: string
  name: string
  country: string
  is_active: boolean
  courses_count: number
}

export function UniversitiesClient({
  initialUniversities,
}: {
  initialUniversities: UniversityItem[]
}) {
  const [universities, setUniversities] = useState<UniversityItem[]>(initialUniversities)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active')

  // Sheet state (Add / Edit)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingUni, setEditingUni] = useState<UniversityItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formCountry, setFormCountry] = useState('UAE')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ConfirmDialog state (Archive / Restore)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<UniversityItem | null>(null)

  // Filtered universities
  const filtered = universities.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.country.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false

    if (filter === 'active') return u.is_active
    if (filter === 'archived') return !u.is_active
    return true
  })

  const handleOpenAdd = () => {
    setEditingUni(null)
    setFormName('')
    setFormCountry('UAE')
    setFormError(null)
    setSheetOpen(true)
  }

  const handleOpenEdit = (uni: UniversityItem) => {
    setEditingUni(uni)
    setFormName(uni.name)
    setFormCountry(uni.country)
    setFormError(null)
    setSheetOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('University name is required')
      return
    }

    // Inline case-insensitive duplicate check
    const isDup = universities.some(
      (u) =>
        u.id !== editingUni?.id &&
        u.name.trim().toLowerCase() === formName.trim().toLowerCase()
    )
    if (isDup) {
      setFormError(`A university named "${formName.trim()}" already exists.`)
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      if (editingUni) formData.append('id', editingUni.id)
      formData.append('name', formName.trim())
      formData.append('country', formCountry.trim() || 'UAE')

      const res = await saveUniversityAction(formData)
      if (res.success) {
        toast.success(editingUni ? 'University updated' : 'University added')
        setSheetOpen(false)
        // Optimistic / local update
        if (editingUni) {
          setUniversities((prev) =>
            prev.map((u) =>
              u.id === editingUni.id
                ? { ...u, name: formName.trim(), country: formCountry.trim() || 'UAE' }
                : u
            )
          )
        } else {
          // Refresh page or re-add
          window.location.reload()
        }
      } else {
        setFormError(res.error ?? 'Failed to save university')
        toast.error(res.error ?? 'Failed to save university')
      }
    })
  }

  const handleToggleArchive = (uni: UniversityItem) => {
    setConfirmTarget(uni)
    setConfirmOpen(true)
  }

  const handleConfirmToggle = async () => {
    if (!confirmTarget) return
    const nextState = !confirmTarget.is_active
    const res = await toggleUniversityActiveAction(confirmTarget.id, nextState)
    if (res.success) {
      toast.success(
        nextState
          ? `Restored "${confirmTarget.name}"`
          : `Archived "${confirmTarget.name}"`
      )
      setUniversities((prev) =>
        prev.map((u) => (u.id === confirmTarget.id ? { ...u, is_active: nextState } : u))
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
              placeholder="Search universities or countries..."
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
            Add University
          </Button>
        </div>
      </div>

      {/* Universities list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-foreground mb-1">
            No universities found
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
            {search
              ? 'No universities match your search query. Try adjusting your search or filters.'
              : 'Start by adding your first partner university or bulk import your catalog.'}
          </p>
          <Button onClick={handleOpenAdd} variant="outline" className="rounded-xl">
            <Plus className="w-4 h-4 mr-1.5" />
            Add University
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden shadow-xs">
          {filtered.map((uni) => (
            <div
              key={uni.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
            >
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/programs/${uni.id}`}
                      className="text-base font-semibold text-foreground hover:text-primary transition-colors truncate"
                    >
                      {uni.name}
                    </Link>
                    {!uni.is_active && (
                      <Badge variant="secondary" className="text-[11px] bg-neutral-200 text-neutral-700">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{uni.country}</span>
                    <span>•</span>
                    <span className="font-medium text-foreground">
                      {uni.courses_count} {uni.courses_count === 1 ? 'course' : 'courses'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(uni)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleArchive(uni)}
                  className={`h-8 px-2.5 text-xs rounded-lg ${
                    uni.is_active
                      ? 'text-muted-foreground hover:text-destructive'
                      : 'text-primary hover:text-primary/80'
                  }`}
                >
                  {uni.is_active ? (
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
                <Link href={`/admin/programs/${uni.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs rounded-lg gap-1 font-medium"
                  >
                    Courses ({uni.courses_count})
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
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
                {editingUni ? 'Edit University' : 'Add University'}
              </SheetTitle>
              <SheetDescription>
                {editingUni
                  ? 'Update university details. Name changes will apply across all linked programs.'
                  : 'Add a new partner university to your catalog.'}
              </SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-4 flex-1">
              {formError && (
                <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="uni-name" className="text-xs font-semibold">
                  University Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="uni-name"
                  placeholder="e.g. Middlesex University Dubai"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-10 rounded-xl"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="uni-country" className="text-xs font-semibold">
                  Country
                </Label>
                <Input
                  id="uni-country"
                  placeholder="e.g. UAE"
                  value={formCountry}
                  onChange={(e) => setFormCountry(e.target.value)}
                  className="h-10 rounded-xl"
                />
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
                {isPending ? 'Saving...' : editingUni ? 'Update University' : 'Add University'}
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
            ? `Archiving "${confirmTarget?.name}" hides it and all its courses from staff course pickers. Existing receipts will not be affected.`
            : `Restoring "${confirmTarget?.name}" makes it visible again in staff course pickers.`
        }
        confirmLabel={confirmTarget?.is_active ? 'Archive University' : 'Restore University'}
        isDestructive={confirmTarget?.is_active}
        onConfirm={handleConfirmToggle}
      />
    </div>
  )
}
