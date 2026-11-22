import React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CreateStudentSheet } from './CreateStudentSheet'
import { StudentsFilterBar } from './StudentsFilterBar'
import { StudentsListTable, type StudentDirectoryRow } from './StudentsListTable'

interface StudentsPageProps {
  searchParams: Promise<{
    q?: string
    balance?: string
    mine?: string
    university?: string
    course?: string
    sort?: string
    page?: string
  }>
}

const PAGE_SIZE = 25

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  const { user, profile } = await requireUser()
  const isOwner = profile.role === 'super_admin' || profile.role === 'admin' || profile.role === 'owner'
  const params = await searchParams

  const q = (params.q || '').trim()
  const balance = params.balance || 'all'
  const mine = params.mine === 'true'
  const university = params.university || ''
  const course = params.course || ''
  const sort = params.sort || 'newest'
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)

  const supabase = await createClient()

  // 1. Fetch metadata for filters and creation wizard in parallel
  const [
    { data: universitiesData },
    { data: coursesData },
    { data: specializationsData },
    { data: staffData },
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
  ])

  const universities = universitiesData || []
  const courses = coursesData || []
  const specializations = specializationsData || []
  const staffList = staffData || []

  // 2. Query student directory view with server-side filters & pagination
  let query = supabase
    .from('student_directory_view')
    .select('*', { count: 'exact' })

  // Search filter
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

  // Balance status filter
  if (balance === 'has_balance') {
    query = query.gt('total_balance', 0)
  } else if (balance === 'fully_paid') {
    query = query.lte('total_balance', 0)
  }

  // Creator filter
  if (mine) {
    query = query.eq('created_by', user.id)
  }

  // University array filter
  if (university) {
    query = query.filter('university_ids', 'cs', `{${university}}`)
  }

  // Course array filter
  if (course) {
    query = query.filter('course_ids', 'cs', `{${course}}`)
  }

  // Sorting
  if (sort === 'last_payment') {
    query = query
      .order('last_payment_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
  } else if (sort === 'balance') {
    query = query
      .order('total_balance', { ascending: false })
      .order('created_at', { ascending: false })
  } else {
    // Newest
    query = query.order('created_at', { ascending: false })
  }

  // Range pagination
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const { data: studentsData, count } = await query.range(from, to)

  const students = (studentsData as StudentDirectoryRow[]) || []
  const totalCount = count ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates Directory"
        subtitle="Manage admitted candidates, enrollment packages, and fee balances"
      >
        <CreateStudentSheet
          universities={universities}
          courses={courses}
          specializations={specializations}
          staffList={staffList}
          currentUserId={user.id}
          isOwner={isOwner}
        />
      </PageHeader>

      <StudentsFilterBar
        universities={universities}
        courses={courses}
      />

      <StudentsListTable
        students={students}
        totalCount={totalCount}
        currentPage={page}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
