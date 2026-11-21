'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X, Filter, RotateCcw } from 'lucide-react'
import type { UniversityOption, CourseOption } from './CreateStudentSheet'

interface StudentsFilterBarProps {
  universities: UniversityOption[]
  courses: CourseOption[]
}

export function StudentsFilterBar({
  universities,
  courses,
}: StudentsFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Current values from URL searchParams
  const initialQ = searchParams.get('q') || ''
  const initialBalance = searchParams.get('balance') || 'all'
  const initialMine = searchParams.get('mine') === 'true'
  const initialUni = searchParams.get('university') || ''
  const initialCourse = searchParams.get('course') || ''
  const initialSort = searchParams.get('sort') || 'newest'

  const [q, setQ] = useState(initialQ)
  const [balance, setBalance] = useState(initialBalance)
  const [mine, setMine] = useState(initialMine)
  const [university, setUniversity] = useState(initialUni)
  const [course, setCourse] = useState(initialCourse)
  const [sort, setSort] = useState(initialSort)

  // Filter courses by selected university if any
  const filteredCourses = university
    ? courses.filter((c) => c.university_id === university)
    : courses

  // Push updated params to URL
  const applyFilters = (updates: {
    q?: string
    balance?: string
    mine?: boolean
    university?: string
    course?: string
    sort?: string
  }) => {
    const params = new URLSearchParams(searchParams.toString())

    const nextQ = updates.q !== undefined ? updates.q : q
    const nextBalance = updates.balance !== undefined ? updates.balance : balance
    const nextMine = updates.mine !== undefined ? updates.mine : mine
    const nextUni = updates.university !== undefined ? updates.university : university
    const nextCourse = updates.course !== undefined ? updates.course : course
    const nextSort = updates.sort !== undefined ? updates.sort : sort

    if (nextQ.trim()) params.set('q', nextQ.trim())
    else params.delete('q')

    if (nextBalance && nextBalance !== 'all') params.set('balance', nextBalance)
    else params.delete('balance')

    if (nextMine) params.set('mine', 'true')
    else params.delete('mine')

    if (nextUni) params.set('university', nextUni)
    else params.delete('university')

    if (nextCourse) params.set('course', nextCourse)
    else params.delete('course')

    if (nextSort && nextSort !== 'newest') params.set('sort', nextSort)
    else params.delete('sort')

    // Reset pagination to page 1 on filter/search change
    params.set('page', '1')

    startTransition(() => {
      router.push(`/candidates?${params.toString()}`)
    })
  }

  // Debounced search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q !== initialQ) {
        applyFilters({ q })
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const handleReset = () => {
    setQ('')
    setBalance('all')
    setMine(false)
    setUniversity('')
    setCourse('')
    setSort('newest')
    startTransition(() => {
      router.push('/candidates')
    })
  }

  const hasActiveFilters =
    Boolean(q.trim()) ||
    balance !== 'all' ||
    mine ||
    Boolean(university) ||
    Boolean(course) ||
    sort !== 'newest'

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm border border-[#E4E7E7]">
      {/* Search Input Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by candidate name, mobile, code, or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 pr-9 min-h-[44px] text-sm"
          />
          {q && (
            <button
              onClick={() => {
                setQ('')
                applyFilters({ q: '' })
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Sort:
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              applyFilters({ sort: e.target.value })
            }}
            className="rounded-xl border border-[#E4E7E7] bg-white px-3 py-2 text-xs font-medium text-[#0A0A0A] focus:border-[#00A57E] min-h-[44px]"
          >
            <option value="newest">Newest First</option>
            <option value="balance">Highest Balance</option>
            <option value="last_payment">Recent Payment</option>
          </select>
        </div>
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
          <Filter className="h-3.5 w-3.5 text-[#00A57E]" />
          <span className="font-semibold uppercase tracking-wider text-[11px] text-[#0A0A0A]">
            Filters:
          </span>
        </div>

        {/* Balance Status Filter */}
        <select
          value={balance}
          onChange={(e) => {
            setBalance(e.target.value)
            applyFilters({ balance: e.target.value })
          }}
          className="rounded-lg border border-[#E4E7E7] bg-white px-2.5 py-1.5 text-xs text-[#0A0A0A] focus:border-[#00A57E] min-h-[36px]"
        >
          <option value="all">All Balances</option>
          <option value="has_balance">Has Balance Due</option>
          <option value="fully_paid">Fully Paid</option>
        </select>

        {/* My Candidates Pill */}
        <button
          type="button"
          onClick={() => {
            const nextMine = !mine
            setMine(nextMine)
            applyFilters({ mine: nextMine })
          }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition min-h-[36px] flex items-center gap-1.5 ${
            mine
              ? 'bg-[#E6F6F2] border-[#CCEDE5] text-[#00805F] font-semibold'
              : 'border-[#E4E7E7] bg-white text-[#6B7272] hover:bg-[#F5F6F6]'
          }`}
        >
          <span>My Candidates</span>
          {mine && <span className="h-1.5 w-1.5 rounded-full bg-[#00A57E]" />}
        </button>

        {/* University Filter */}
        <select
          value={university}
          onChange={(e) => {
            const u = e.target.value
            setUniversity(u)
            setCourse('')
            applyFilters({ university: u, course: '' })
          }}
          className="rounded-lg border border-[#E4E7E7] bg-white px-2.5 py-1.5 text-xs text-[#0A0A0A] focus:border-[#00A57E] min-h-[36px] max-w-[180px] truncate"
        >
          <option value="">All Universities</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {/* Course Filter */}
        <select
          value={course}
          onChange={(e) => {
            setCourse(e.target.value)
            applyFilters({ course: e.target.value })
          }}
          className="rounded-lg border border-[#E4E7E7] bg-white px-2.5 py-1.5 text-xs text-[#0A0A0A] focus:border-[#00A57E] min-h-[36px] max-w-[180px] truncate"
        >
          <option value="">All Courses</option>
          {filteredCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Reset Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground h-9 px-2 gap-1 ml-auto"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </Button>
        )}
      </div>
    </div>
  )
}
