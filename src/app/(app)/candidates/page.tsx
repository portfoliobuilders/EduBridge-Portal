import React from 'react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CreateStudentSheet } from './CreateStudentSheet'
import { CandidatesHeader } from './CandidatesHeader'
import { CandidatesKpiStrip, type CandidateDirectoryKpis } from './CandidatesKpiStrip'
import { CandidatesToolbar } from './CandidatesToolbar'
import { StudentsListTable, type StudentDirectoryRow } from './StudentsListTable'

interface CandidatesPageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    balance?: string
    mine?: string
    university?: string
    course?: string
    sort?: string
    page?: string
    pageSize?: string
  }>
}

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const { user, profile } = await requireUser()
  const isOwner = profile.role === 'super_admin' || profile.role === 'admin' || profile.role === 'owner'
  const isStaff = profile.role === 'staff'

  const params = await searchParams

  const q = (params.q || '').trim()
  // Backward compatibility with legacy balance param
  const status =
    params.status ||
    (params.balance === 'has_balance'
      ? 'balance_due'
      : params.balance === 'fully_paid'
      ? 'fully_paid'
      : 'all')
  const mine = params.mine === 'true'
  const university = params.university || ''
  const course = params.course || ''
  const sort = params.sort || 'newest'
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const pageSize = [25, 50, 100].includes(Number(params.pageSize))
    ? Number(params.pageSize)
    : 25

  const supabase = await createClient()

  // 1. Fetch metadata, KPI metrics, and dropdown options in parallel
  const [
    { data: universitiesData },
    { data: coursesData },
    { data: specializationsData },
    { data: staffData },
    { data: kpiData },
  ] = await Promise.all([
    supabase
      .from('universities')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('courses')
      .select('id, university_id, name, level, default_fee')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('specializations')
      .select('id, course_id, name, default_fee')
      .eq('is_active', true)
      .order('name'),
    isOwner
      ? supabase
          .from('profiles')
          .select('id, full_name, role, job_title')
          .eq('is_active', true)
          .order('full_name')
      : Promise.resolve({ data: [] }),
    supabase.rpc('get_candidate_directory_kpis'),
  ])

  const universities = universitiesData || []
  const courses = coursesData || []
  const specializations = specializationsData || []
  const staffList = staffData || []

  const rawKpi = kpiData?.[0]
  const kpis: CandidateDirectoryKpis = {
    total_candidates: Number(rawKpi?.total_candidates ?? 0),
    outstanding_balance: Number(rawKpi?.outstanding_balance ?? 0),
    collected_this_month: Number(rawKpi?.collected_this_month ?? 0),
    fully_paid_count: Number(rawKpi?.fully_paid_count ?? 0),
    balance_due_count: Number(rawKpi?.balance_due_count ?? 0),
    overdue_count: Number(rawKpi?.overdue_count ?? 0),
    no_enrollment_count: Number(rawKpi?.no_enrollment_count ?? 0),
  }

  // 2. Query student directory view with server-side filters & pagination
  let query = supabase
    .from('student_directory_view')
    .select('*', { count: 'exact' })

  // Search filter (name / mobile / code / email)
  if (q) {
    const cleanDigits = q.replace(/\D/g, '')
    const noZero = cleanDigits.replace(/^0+/, '')
    const clauses = [
      `full_name.ilike.%${q}%`,
      `student_code.ilike.%${q}%`,
      `mobile.ilike.%${q}%`,
      `email.ilike.%${q}%`,
    ]
    if (cleanDigits.length >= 3) {
      clauses.push(`mobile.ilike.%${cleanDigits}%`)
    }
    if (noZero.length >= 3 && noZero !== cleanDigits) {
      clauses.push(`mobile.ilike.%${noZero}%`)
    }
    query = query.or(clauses.join(','))
  }

  // Status filter computed from SQL view column
  if (status === 'balance_due') {
    query = query.eq('candidate_status', 'Balance due')
  } else if (status === 'overdue') {
    query = query.eq('candidate_status', 'Overdue')
  } else if (status === 'fully_paid') {
    query = query.eq('candidate_status', 'Fully paid')
  } else if (status === 'no_enrollment') {
    query = query.eq('candidate_status', 'No enrollment')
  }

  // Creator filter
  if (mine) {
    query = query.eq('created_by', user.id)
  }

  // University filter
  if (university) {
    query = query.filter('university_ids', 'cs', `{${university}}`)
  }

  // Course filter
  if (course) {
    query = query.filter('course_ids', 'cs', `{${course}}`)
  }

  // Sorting
  if (sort === 'name_asc') {
    query = query.order('full_name', { ascending: true }).order('created_at', { ascending: false })
  } else if (sort === 'balance_desc') {
    query = query.order('total_balance', { ascending: false }).order('created_at', { ascending: false })
  } else if (sort === 'last_payment') {
    query = query
      .order('last_payment_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
  } else {
    // Newest first (default)
    query = query.order('created_at', { ascending: false })
  }

  // Range pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const { data: studentsData, count } = await query.range(from, to)

  const students = (studentsData as StudentDirectoryRow[]) || []
  const totalCount = count ?? 0

  const hasActiveFilters = Boolean(
    q ||
    (status && status !== 'all') ||
    university ||
    course ||
    mine ||
    (sort && sort !== 'newest')
  )

  return (
    <div className="max-w-[1280px] w-full mx-auto space-y-6">
      {/* 1. Header with title, subtitle, Export, and + New Candidate */}
      <CandidatesHeader students={students}>
        <CreateStudentSheet
          universities={universities}
          courses={courses}
          specializations={specializations}
          staffList={staffList}
          currentUserId={user.id}
          isOwner={isOwner}
        />
      </CandidatesHeader>

      {/* 2. Interactive KPI Strip (4 cards, click applies matching filter) */}
      <CandidatesKpiStrip kpis={kpis} activeStatus={status} />

      {/* 3. Toolbar (Search, status tabs with counts, Comboboxes, Sort, Clear) */}
      <CandidatesToolbar
        universities={universities}
        courses={courses}
        kpis={kpis}
        isStaff={isStaff}
      />

      {/* 4. Directory Table (>=1024px) / Cards (<1024px) with Bulk Actions & Pagination */}
      <StudentsListTable
        students={students}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  )
}
