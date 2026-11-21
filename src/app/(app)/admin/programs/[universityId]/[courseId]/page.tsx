import React from 'react'
import { notFound } from 'next/navigation'
import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { SpecializationsClient, type SpecializationItem } from './SpecializationsClient'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'

export const dynamic = 'force-dynamic'

interface SpecializationRow {
  id: string
  course_id: string
  name: string
  default_fee: number | null
  is_active: boolean
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ universityId: string; courseId: string }>
}) {
  await requireOwner()
  const { universityId, courseId } = await params
  const supabase = await createClient()

  // Fetch university
  const { data: university } = await supabase
    .from('universities')
    .select('id, name')
    .eq('id', universityId)
    .single()

  if (!university) {
    notFound()
  }

  // Fetch course
  const { data: course } = await supabase
    .from('courses')
    .select('id, university_id, name, level, duration, default_fee, is_active')
    .eq('id', courseId)
    .single()

  if (!course) {
    notFound()
  }

  // Fetch specializations
  const { data: specializations } = await supabase
    .from('specializations')
    .select('id, course_id, name, default_fee, is_active')
    .eq('course_id', courseId)
    .order('name', { ascending: true })

  const typedSpecs = (specializations ?? []) as unknown as SpecializationRow[]
  const formattedSpecs: SpecializationItem[] = typedSpecs.map((s) => ({
    id: s.id,
    course_id: s.course_id,
    name: s.name,
    default_fee: s.default_fee !== null ? Number(s.default_fee) : null,
    is_active: s.is_active,
  }))

  const courseFee = course.default_fee !== null ? Number(course.default_fee) : null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Programmes', href: '/admin/programs' },
          { label: university.name, href: `/admin/programs/${university.id}` },
          { label: course.name },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
              {course.name}
            </h1>
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">
              {course.level}
            </Badge>
            {!course.is_active && (
              <Badge variant="secondary" className="bg-neutral-200 text-neutral-700">
                Archived
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            University: <span className="font-medium text-foreground">{university.name}</span>
            {course.duration && <> • Duration: <span className="font-medium text-foreground">{course.duration}</span></>}
            {courseFee !== null && (
              <> • Default Fee: <span className="font-semibold text-foreground font-mono tabular-nums">{formatMoney(courseFee)}</span></>
            )}
          </p>
        </div>
      </div>

      <SpecializationsClient
        courseId={course.id}
        courseName={course.name}
        courseFee={courseFee}
        initialSpecializations={formattedSpecs}
      />
    </div>
  )
}
