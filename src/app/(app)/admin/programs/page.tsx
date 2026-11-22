import React from 'react'
import type { Metadata } from 'next'
import { requireAdminOrAbove } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Programs & Courses',
}
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/PageHeader'
import { AdminNav } from '@/components/admin/AdminNav'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { UniversitiesClient, type UniversityItem } from './UniversitiesClient'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface UniversityRow {
  id: string
  name: string
  country: string
  is_active: boolean
  courses: Array<{ id: string }> | null
}

export default async function ProgramsPage() {
  await requireAdminOrAbove()
  const supabase = await createClient()

  // Fetch universities and count of courses
  const { data: universities } = await supabase
    .from('universities')
    .select('id, name, country, is_active, courses(id)')
    .order('name', { ascending: true })

  const typedUnis = (universities ?? []) as unknown as UniversityRow[]
  const formattedUniversities: UniversityItem[] = typedUnis.map((u) => ({
    id: u.id,
    name: u.name,
    country: u.country,
    is_active: u.is_active,
    courses_count: Array.isArray(u.courses) ? u.courses.length : 0,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Programmes' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Programmes Catalog"
          subtitle="Manage universities, courses, specializations, and default tuition fees"
        />

        <Link href="/admin/programs/import">
          <Button variant="outline" className="rounded-xl gap-2 h-10 font-medium">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            Bulk Import CSV
          </Button>
        </Link>
      </div>

      <AdminNav />

      <UniversitiesClient initialUniversities={formattedUniversities} />
    </div>
  )
}
