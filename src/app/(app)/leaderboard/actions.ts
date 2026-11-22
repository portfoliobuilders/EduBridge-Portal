'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

export type LeaderboardPeriod = 'this_week' | 'this_month' | 'this_quarter'
export type LeaderboardMetric = 'admissions' | 'collections'

export interface LeaderboardEntry {
  rank: number
  user_id: string
  full_name: string
  first_name: string
  avatar_url: string | null
  job_title: string | null
  admissions_count: number
  collections_amount: number | null
  prev_rank: number | null
  rank_delta: number | null
  value_delta: number | null
  is_self: boolean
}

export interface GetLeaderboardParams {
  period?: LeaderboardPeriod
  metric?: LeaderboardMetric
  teamId?: string | null
}

export async function getLeaderboardAction(params: GetLeaderboardParams = {}): Promise<{
  data: LeaderboardEntry[]
  error: string | null
  showAedToStaff: boolean
  viewerRole: string
  viewerId: string
}> {
  try {
    const { profile } = await requireUser()
    const supabase = await createClient()

    const period = params.period || 'this_month'
    const metric = params.metric || 'admissions'
    const teamId = params.teamId || null

    const [{ data, error }, { data: settingsData }] = await Promise.all([
      supabase.rpc('get_staff_leaderboard', {
        p_period: period,
        p_metric: metric,
        p_team_id: teamId || undefined,
      }),
      supabase.from('company_settings').select('show_aed_to_staff').limit(1).maybeSingle(),
    ])

    if (error) {
      console.error('get_staff_leaderboard error:', error)
      return {
        data: [],
        error: error.message,
        showAedToStaff: false,
        viewerRole: profile.role,
        viewerId: profile.id,
      }
    }

    const typedData = ((data || []) as unknown as LeaderboardEntry[]).map((row) => ({
      ...row,
      rank: Number(row.rank),
      admissions_count: Number(row.admissions_count || 0),
      collections_amount: row.collections_amount !== null ? Number(row.collections_amount) : null,
      prev_rank: row.prev_rank !== null ? Number(row.prev_rank) : null,
      rank_delta: row.rank_delta !== null ? Number(row.rank_delta) : null,
      value_delta: row.value_delta !== null ? Number(row.value_delta) : null,
      is_self: Boolean(row.is_self),
    }))

    return {
      data: typedData,
      error: null,
      showAedToStaff: Boolean(settingsData?.show_aed_to_staff),
      viewerRole: profile.role,
      viewerId: profile.id,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch leaderboard'
    console.error('Leaderboard action error:', err)
    return {
      data: [],
      error: msg,
      showAedToStaff: false,
      viewerRole: 'staff',
      viewerId: '',
    }
  }
}
