'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  GraduationCap,
  ChevronRight,
  Archive,
  RefreshCw,
  Edit2,
  Clock,
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
import { saveCourseAction, toggleCourseActiveAction } from '../actions'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/money'

export interface CourseItem {
  id: string
  university_id: string
  name: string
  level: string
  duration: string | null
  default_fee: number | null
  is_active: boolean
  specializations_count: number
}

const DEGREE_LEVELS = [
  'Diploma',
  'Bachelor',
  'Master',
  'PhD',
  'Certificate',
  'Other',
] as const

export function CoursesClient({
  universityId,
  universityName,
  initialCourses,
}: {
  universityId: string
  universityName: string
  initialCourses: CourseItem[]
}) {
  const [courses, setCourses] = useState<CourseItem[]>(initialCourses)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active')

  // Sheet state (Add / Edit)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formLevel, setFormLevel] = useState<string>('Bachelor')
  const [formDuration, setFormDuration] = useState('')
  const [formDefaultFee, setFormDefaultFee] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ConfirmDialog state (Archive / Restore)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<CourseItem | null>(null)

  // Filtered courses
  const filtered = courses.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.level.toLowerCase().includes(search.toLowerCase()) ||
      (c.duration && c.duration.toLowerCase().includes(search.toLowerCase()))
    if (!matchesSearch) return false

    if (filter === 'active') return c.is_active
    if (filter === 'archived') return !c.is_active
    return true
  })

  const handleOpenAdd = () => {
    setEditingCourse(null)
    setFormName('')
    setFormLevel('Bachelor')
    setFormDuration('')
    setFormDefaultFee('')
    setFormError(null)
    setSheetOpen(true)
  }

  const handleOpenEdit = (course: CourseItem) => {
    setEditingCourse(course)
    setFormName(course.name)
    setFormLevel(course.level)
    setFormDuration(course.duration || '')
    setFormDefaultFee(course.default_fee !== null ? course.default_fee.toFixed(2) : '')
    setFormError(null)
    setSheetOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('Course name is required')
      return
    }

    if (formDefaultFee && !/^\d+(\.\d{1,2})?$/.test(formDefaultFee.trim())) {
      setFormError('Default fee must be a valid number with up to 2 decimal places')
      return
    }

    // Inline case-insensitive duplicate check within university
    const isDup = courses.some(
      (c) =>
        c.id !== editingCourse?.id &&
        c.name.trim().toLowerCase() === formName.trim().toLowerCase()
    )
    if (isDup) {
      setFormError(`A course named "${formName.trim()}" already exists in this university.`)
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      if (editingCourse) formData.append('id', editingCourse.id)
      formData.append('university_id', universityId)
      formData.append('name', formName.trim())
      formData.append('level', formLevel)
      if (formDuration.trim()) formData.append('duration', formDuration.trim())
      if (formDefaultFee.trim()) formData.append('default_fee', formDefaultFee.trim())

      const res = await saveCourseAction(formData)
      if (res.success) {
        toast.success(editingCourse ? 'Course updated' : 'Course added')
        setSheetOpen(false)
        window.location.reload()
      } else {
        setFormError(res.error ?? 'Failed to save course')
        toast.error(res.error ?? 'Failed to save course')
      }
    })
  }

  const handleToggleArchive = (course: CourseItem) => {
    setConfirmTarget(course)
    setConfirmOpen(true)
  }

  const handleConfirmToggle = async () => {
    if (!confirmTarget) return
    const nextState = !confirmTarget.is_active
    const res = await toggleCourseActiveAction(confirmTarget.id, universityId, nextState)
    if (res.success) {
      toast.success(
        nextState ? `Restored "${confirmTarget.name}"` : `Archived "${confirmTarget.name}"`
      )
      setCourses((prev) =>
        prev.map((c) => (c.id === confirmTarget.id ? { ...c, is_active: nextState } : c))
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
              placeholder="Search courses, levels, durations..."
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
            Add Course
          </Button>
        </div>
      </div>

      {/* Courses list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-foreground mb-1">
            No courses found
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
            {search
              ? 'No courses match your search query.'
              : `No courses have been added to ${universityName} yet.`}
          </p>
          <Button onClick={handleOpenAdd} variant="outline" className="rounded-xl">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Course
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden shadow-xs">
          {filtered.map((course) => (
            <div
              key={course.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
            >
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/programs/${universityId}/${course.id}`}
                      className="text-base font-semibold text-foreground hover:text-primary transition-colors truncate"
                    >
                      {course.name}
                    </Link>
                    <Badge variant="outline" className="text-[11px] font-normal border-primary/30 text-primary">
                      {course.level}
                    </Badge>
                    {!course.is_active && (
                      <Badge variant="secondary" className="text-[11px] bg-neutral-200 text-neutral-700">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {course.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {course.duration}
                      </span>
                    )}
                    {course.default_fee !== null ? (
                      <span className="font-semibold text-foreground font-mono tabular-nums">
                        {formatMoney(course.default_fee)}
                      </span>
                    ) : (
                      <span>Fee not set</span>
                    )}
                    <span>•</span>
                    <span className="font-medium text-foreground">
                      {course.specializations_count}{' '}
                      {course.specializations_count === 1 ? 'specialization' : 'specializations'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(course)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleArchive(course)}
                  className={`h-8 px-2.5 text-xs rounded-lg ${
                    course.is_active
                      ? 'text-muted-foreground hover:text-destructive'
                      : 'text-primary hover:text-primary/80'
                  }`}
                >
                  {course.is_active ? (
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
                <Link href={`/admin/programs/${universityId}/${course.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs rounded-lg gap-1 font-medium"
                  >
                    Specializations ({course.specializations_count})
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
              <SheetTitle>{editingCourse ? 'Edit Course' : 'Add Course'}</SheetTitle>
              <SheetDescription>
                {editingCourse
                  ? `Update course details for ${universityName}.`
                  : `Add a new degree course to ${universityName}.`}
              </SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-4 flex-1 overflow-y-auto">
              {formError && (
                <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="course-name" className="text-xs font-semibold">
                  Course Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="course-name"
                  placeholder="e.g. BSc Information Technology"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-10 rounded-xl"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="course-level" className="text-xs font-semibold">
                  Level <span className="text-destructive">*</span>
                </Label>
                <Select value={formLevel} onValueChange={(val) => { if (val) setFormLevel(val) }}>
                  <SelectTrigger id="course-level" className="h-10 rounded-xl">
                    <SelectValue placeholder="Select degree level" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEGREE_LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="course-duration" className="text-xs font-semibold">
                  Duration
                </Label>
                <Input
                  id="course-duration"
                  placeholder="e.g. 3 Years, 1 Year, etc."
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="course-fee" className="text-xs font-semibold">
                  Default Tuition Fee (AED) — before VAT treatment
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                    AED
                  </span>
                  <Input
                    id="course-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formDefaultFee}
                    onChange={(e) => setFormDefaultFee(e.target.value)}
                    className="pl-12 h-10 rounded-xl font-mono tabular-nums"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Base tuition fee before VAT treatment is applied during candidate enrollment.
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
                {isPending ? 'Saving...' : editingCourse ? 'Update Course' : 'Add Course'}
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
            ? `Archiving "${confirmTarget?.name}" hides it from staff course pickers. Existing enrollments and receipts are preserved.`
            : `Restoring "${confirmTarget?.name}" makes it available again in staff course pickers.`
        }
        confirmLabel={confirmTarget?.is_active ? 'Archive Course' : 'Restore Course'}
        isDestructive={confirmTarget?.is_active}
        onConfirm={handleConfirmToggle}
      />
    </div>
  )
}
