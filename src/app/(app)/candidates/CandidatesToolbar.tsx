'use client'

import React, { useState, useEffect, useTransition, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, SlidersHorizontal, RotateCcw, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { UniversityOption, CourseOption } from './CreateStudentSheet'
import type { CandidateDirectoryKpis } from './CandidatesKpiStrip'

interface CandidatesToolbarProps {
  universities: UniversityOption[]
  courses: CourseOption[]
  kpis: CandidateDirectoryKpis
  isStaff: boolean
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'balance_desc', label: 'Balance: high to low' },
  { value: 'last_payment', label: 'Last payment' },
]

export function CandidatesToolbar({
  universities,
  courses,
  kpis,
  isStaff,
}: CandidatesToolbarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Current URL states
  const urlQ = searchParams.get('q') || ''
  const urlStatus = searchParams.get('status') || 'all'
  const urlUni = searchParams.get('university') || ''
  const urlCourse = searchParams.get('course') || ''
  const urlMine = searchParams.get('mine') === 'true'
  const urlSort = searchParams.get('sort') || 'newest'

  // Local debounced search state
  const [searchValue, setSearchValue] = useState(urlQ)
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  // Keep local search in sync with URL
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ)
    setSearchValue(urlQ)
  }

  // Count active non-default filters (excluding status which has tabs)
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (urlQ.trim()) count++
    if (urlUni) count++
    if (urlCourse) count++
    if (urlMine) count++
    if (urlSort && urlSort !== 'newest') count++
    return count
  }, [urlQ, urlUni, urlCourse, urlMine, urlSort])

  const hasAnyActiveFilter = activeFiltersCount > 0 || (urlStatus && urlStatus !== 'all')

  const updateUrlParams = (updates: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, val]) => {
      if (!val || val === 'all' || (key === 'mine' && val === 'false') || (key === 'sort' && val === 'newest')) {
        params.delete(key)
      } else {
        params.set(key, val)
      }
    })

    // Reset page to 1 on any filter change
    params.set('page', '1')

    startTransition(() => {
      router.push(`/candidates?${params.toString()}`)
    })
  }

  // 250ms debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== urlQ) {
        updateUrlParams({ q: searchValue.trim() || null })
      }
    }, 250)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue])

  const handleClearAll = () => {
    setSearchValue('')
    startTransition(() => {
      router.push('/candidates')
    })
  }

  // Available courses filtered by selected university
  const filteredCourses = useMemo(() => {
    if (!urlUni) return courses
    return courses.filter((c) => c.university_id === urlUni)
  }, [courses, urlUni])

  const universityItems = useMemo(
    () => universities.map((u) => ({ value: u.id, label: u.name })),
    [universities]
  )

  const courseItems = useMemo(
    () => filteredCourses.map((c) => ({ value: c.id, label: c.name })),
    [filteredCourses]
  )

  const statusTabs = [
    { id: 'all', label: 'All', count: kpis.total_candidates },
    { id: 'balance_due', label: 'Balance due', count: kpis.balance_due_count },
    { id: 'overdue', label: 'Overdue', count: kpis.overdue_count },
    { id: 'fully_paid', label: 'Fully paid', count: kpis.fully_paid_count },
    { id: 'no_enrollment', label: 'No enrollment', count: kpis.no_enrollment_count },
  ]

  return (
    <div className="space-y-3">
      {/* 1. Status Tabs with exact SQL counts */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Candidate status filter"
          className="flex items-center gap-1.5 p-1 bg-[#F5F6F6] rounded-xl border border-[#E4E7E7] shrink-0"
        >
          {statusTabs.map((tab) => {
            const isActive = tab.id === 'all' ? !urlStatus : urlStatus === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => updateUrlParams({ status: tab.id === 'all' ? null : tab.id })}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-white text-[#00805F] shadow-xs'
                    : 'text-[#6B7272] hover:text-[#0A0A0A] hover:bg-white/50'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums',
                    isActive
                      ? 'bg-[#E6F6F2] text-[#00805F]'
                      : 'bg-[#E4E7E7] text-[#6B7272]'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {hasAnyActiveFilter && (
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs font-semibold text-[#00A57E] hover:text-[#00805F] px-2 py-1 rounded-lg shrink-0 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* 2. Main Toolbar Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search input with debouncing and clear button */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7272]" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search by candidate name, code, mobile, email..."
            className="pl-9 pr-9 h-11 bg-white border-[#E4E7E7] rounded-xl text-sm focus-visible:border-[#00A57E] focus-visible:ring-2 focus-visible:ring-[#00A57E]/20"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => {
                setSearchValue('')
                updateUrlParams({ q: null })
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-[#6B7272] hover:text-[#0A0A0A] rounded"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Desktop inline controls (>=1024px) */}
        <div className="hidden lg:flex items-center gap-2">
          {/* University Combobox */}
          <div className="w-48">
            <Combobox
              items={universityItems}
              value={urlUni}
              onChange={(val) => {
                updateUrlParams({
                  university: val === urlUni ? null : val,
                  course: null, // clear course on uni change
                })
              }}
              placeholder="All Universities"
              searchPlaceholder="Filter university..."
              emptyText="No university found"
              className="h-11 rounded-xl text-xs"
            />
          </div>

          {/* Course Combobox */}
          <div className="w-48">
            <Combobox
              items={courseItems}
              value={urlCourse}
              onChange={(val) => {
                updateUrlParams({ course: val === urlCourse ? null : val })
              }}
              placeholder="All Courses"
              searchPlaceholder="Filter course..."
              emptyText="No course found"
              className="h-11 rounded-xl text-xs"
            />
          </div>

          {/* My Candidates toggle for admin / owner */}
          {!isStaff && (
            <button
              type="button"
              onClick={() => updateUrlParams({ mine: urlMine ? null : 'true' })}
              className={cn(
                'h-11 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap',
                urlMine
                  ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F]'
                  : 'border-[#E4E7E7] bg-white text-[#0A0A0A] hover:bg-[#F5F6F6]'
              )}
            >
              {urlMine && <Check className="w-3.5 h-3.5 text-[#00A57E]" />}
              My candidates
            </button>
          )}

          {/* Sort dropdown */}
          <div className="w-44">
            <Select
              value={urlSort}
              onValueChange={(val) => updateUrlParams({ sort: val })}
            >
              <SelectTrigger className="h-11 rounded-xl border-[#E4E7E7] bg-white text-xs font-medium text-[#0A0A0A]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E4E7E7] rounded-xl shadow-lg">
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mobile / Tablet Filter Button (<1024px) */}
        <div className="flex lg:hidden items-center gap-2">
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  className={cn(
                    'h-11 flex-1 sm:flex-initial rounded-xl border-[#E4E7E7] bg-white text-xs font-semibold flex items-center justify-center gap-2',
                    activeFiltersCount > 0 && 'border-[#00A57E] text-[#00805F] bg-[#E6F6F2]/30'
                  )}
                />
              }
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#00A57E] text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </SheetTrigger>

            <SheetContent
              side="bottom"
              className="bg-white rounded-t-[20px] max-h-[85vh] overflow-y-auto p-6 border-[#E4E7E7]"
            >
              <SheetHeader className="text-left pb-4 border-b border-[#E4E7E7]">
                <SheetTitle className="text-base font-bold text-[#0A0A0A]">
                  Filter Candidates
                </SheetTitle>
              </SheetHeader>

              <div className="py-4 space-y-4">
                {/* University */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0A0A0A]">
                    University
                  </label>
                  <Combobox
                    items={universityItems}
                    value={urlUni}
                    onChange={(val) => {
                      updateUrlParams({
                        university: val === urlUni ? null : val,
                        course: null,
                      })
                    }}
                    placeholder="All Universities"
                    searchPlaceholder="Search university..."
                    emptyText="No university found"
                    className="h-11 rounded-xl"
                  />
                </div>

                {/* Course */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0A0A0A]">
                    Course
                  </label>
                  <Combobox
                    items={courseItems}
                    value={urlCourse}
                    onChange={(val) => {
                      updateUrlParams({ course: val === urlCourse ? null : val })
                    }}
                    placeholder="All Courses"
                    searchPlaceholder="Search course..."
                    emptyText="No course found"
                    className="h-11 rounded-xl"
                  />
                </div>

                {/* My Candidates */}
                {!isStaff && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => updateUrlParams({ mine: urlMine ? null : 'true' })}
                      className={cn(
                        'w-full h-11 px-3 rounded-xl border text-sm font-semibold flex items-center justify-between transition-colors',
                        urlMine
                          ? 'border-[#00A57E] bg-[#E6F6F2] text-[#00805F]'
                          : 'border-[#E4E7E7] bg-white text-[#0A0A0A]'
                      )}
                    >
                      <span>Show only my admitted candidates</span>
                      {urlMine && <Check className="w-4 h-4 text-[#00A57E]" />}
                    </button>
                  </div>
                )}

                {/* Sort */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-[#0A0A0A]">
                    Sort order
                  </label>
                  <Select
                    value={urlSort}
                    onValueChange={(val) => updateUrlParams({ sort: val })}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-[#E4E7E7] bg-white text-sm">
                      <SelectValue placeholder="Sort order" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E4E7E7] rounded-xl shadow-lg">
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <SheetFooter className="pt-4 border-t border-[#E4E7E7] flex flex-row items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearAll}
                  className="rounded-xl border-[#E4E7E7] text-xs h-11 flex-1"
                >
                  Reset all
                </Button>
                <Button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  className="bg-[#00A57E] hover:bg-[#00805F] text-white rounded-xl text-xs font-semibold h-11 flex-1 shadow-sm"
                >
                  Apply Filters
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Quick Sort for Mobile */}
          <div className="w-36 sm:w-44">
            <Select
              value={urlSort}
              onValueChange={(val) => updateUrlParams({ sort: val })}
            >
              <SelectTrigger className="h-11 rounded-xl border-[#E4E7E7] bg-white text-xs font-medium text-[#0A0A0A]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E4E7E7] rounded-xl shadow-lg">
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
