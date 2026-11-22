import React from 'react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDubaiDateRange } from '@/lib/date'
import { OwnerDashboard } from '@/components/dashboard/OwnerDashboard'
import { StaffDashboard } from '@/components/dashboard/StaffDashboard'

interface OutstandingRecord {
  enrollment_id: string
  student_id: string
  student_name: string
  student_code: string
  mobile?: string | null
  course_name: string
  university_name: string
  balance: number | string
  last_payment_at?: string | null
  days_since_last_payment?: number | null
  share_token: string
}

interface RecentReceiptRecord {
  id: string
  receipt_no: string
  paid_at: string
  student_name: string
  mode: string
  purpose: string
  amount: number | string
  status: string
}

export interface DocumentLinkStats {
  total_received: number
  unverified: number
  active_links: number
}

export default async function HomePage() {
  const { profile } = await requireUser()
  const supabase = await createClient()

  if (profile.role === 'owner') {
    const todayRange = getDubaiDateRange('today')
    const [{ data: kpis }, { data: docStats }] = await Promise.all([
      supabase.rpc('dashboard_kpis', {
        p_from: todayRange.from,
        p_to: todayRange.to,
        p_staff_id: undefined,
      }),
      supabase.rpc('get_link_documents_stats', { p_days: 7 }),
    ])

    return (
      <OwnerDashboard
        initialKpis={kpis as Record<string, unknown>}
        initialRange={todayRange}
        documentStats={docStats as DocumentLinkStats | null}
        profile={{
          full_name: profile.full_name,
          role: profile.role,
        }}
      />
    )
  }

  // Staff User Perspective
  const todayRange = getDubaiDateRange('today')
  const monthRange = getDubaiDateRange('month')

  const [
    todayKpisRes,
    monthKpisRes,
    outstandingRes,
    recentReceiptsRes,
    candidatesCountRes,
    receiptsCountRes,
    settingsRes,
    docStatsRes,
  ] = await Promise.all([
    supabase.rpc('dashboard_kpis', {
      p_from: todayRange.from,
      p_to: todayRange.to,
      p_staff_id: profile.id,
    }),
    supabase.rpc('dashboard_kpis', {
      p_from: monthRange.from,
      p_to: monthRange.to,
      p_staff_id: profile.id,
    }),
    supabase.rpc('report_outstanding', {
      p_staff_id: profile.id,
      p_min_balance: 0,
    }),
    supabase.rpc('report_collections', {
      p_from: '2020-01-01T00:00:00Z',
      p_to: new Date().toISOString(),
      p_staff_id: profile.id,
    }),
    supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('admission_staff_id', profile.id),
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('received_by', profile.id),
    supabase
      .from('company_settings')
      .select('whatsapp_statement_template')
      .limit(1)
      .maybeSingle(),
    supabase.rpc('get_link_documents_stats', { p_days: 7 }),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://edubridgeeducation.com'

  const outstandingRows = (
    ((outstandingRes.data as Record<string, unknown>)?.rows as OutstandingRecord[]) || []
  )
  const recentReceiptsRows = (
    (((recentReceiptsRes.data as Record<string, unknown>)?.rows as RecentReceiptRecord[]) || []).slice(0, 10)
  )

  return (
    <StaffDashboard
      todayKpis={todayKpisRes.data as Record<string, unknown>}
      monthKpis={monthKpisRes.data as Record<string, unknown>}
      pendingBalances={outstandingRows}
      recentReceipts={recentReceiptsRows}
      myCandidateCount={candidatesCountRes.count || 0}
      myReceiptCount={receiptsCountRes.count || 0}
      documentStats={docStatsRes.data as DocumentLinkStats | null}
      profile={{
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
      }}
      whatsappTemplate={settingsRes.data?.whatsapp_statement_template || undefined}
      appUrl={appUrl}
    />
  )
}
