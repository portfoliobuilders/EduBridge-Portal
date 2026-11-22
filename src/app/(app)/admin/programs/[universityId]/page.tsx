import React from 'react'
import { notFound } from 'next/navigation'
import { requireAdminOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { CoursesClient, type CourseItem } from './CoursesClient'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface CourseRow {
  id: string
  university_id: string
  name: string
  level: string
  duration: string | null
  default_fee: number | null
  is_active: boolean
  specializations: Array<{ id: string }> | null
}

export default async function UniversityDetailPage({
  params,
}: {
  params: Promise<{ universityId: string }>
}) {
  await requireAdminOrAbove()
  const { universityId } = await params
  const supabase = await createClient()

  // Fetch university
  const { data: university } = await supabase
    .from('universities')
    .select('id, name, country, is_active')
    .eq('id', universityId)
    .single()

  if (!university) {
    notFound()
  }

  // Fetch courses with specializations count
  const { data: courses } = await supabase
    .from('courses')
    .select('id, university_id, name, level, duration, default_fee, is_active, specializations(id)')
    .eq('university_id', universityId)
    .order('name', { ascending: true })

  const typedCourses = (courses ?? []) as unknown as CourseRow[]
  const formattedCourses: CourseItem[] = typedCourses.map((c) => ({
    id: c.id,
    university_id: c.university_id,
    name: c.name,
    level: c.level,
    duration: c.duration,
    default_fee: c.default_fee !== null ? Number(c.default_fee) : null,
    is_active: c.is_active,
    specializations_count: Array.isArray(c.specializations) ? c.specializations.length : 0,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Programmes', href: '/admin/programs' },
          { label: university.name },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
              {university.name}
            </h1>
            <Badge
              variant={university.is_active ? 'outline' : 'secondary'}
              className={
                university.is_active
                  ? 'border-primary/40 text-primary bg-primary/5'
                  : 'bg-neutral-200 text-neutral-700'
              }
            >
              {university.is_active ? 'Active Partner' : 'Archived'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Country: <span className="font-medium text-foreground">{university.country}</span> • Courses catalog and degree tracks
          </p>
        </div>
      </div>

      <CoursesClient
        universityId={university.id}
        universityName={university.name}
        initialCourses={formattedCourses}
      />
    </div>
  )
}
