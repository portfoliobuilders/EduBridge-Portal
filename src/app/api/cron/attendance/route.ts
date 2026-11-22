import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  return handleCron(req)
}

export async function POST(req: NextRequest) {
  return handleCron(req)
}

async function handleCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  // Validate CRON_SECRET header
  const authHeader = req.headers.get('authorization')
  const xCronSecret = req.headers.get('x-cron-secret')

  const isAuthorized =
    Boolean(cronSecret) &&
    (authHeader === `Bearer ${cronSecret}` || xCronSecret === cronSecret)

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing CRON_SECRET' },
      { status: 401 }
    )
  }

  const searchParams = req.nextUrl.searchParams
  const action = searchParams.get('action') || 'all'

  try {
    const supabase = createAdminClient()
    let closeResult = null
    let absenceResult = null

    // 1. Process daily close (auto-close open sessions -> missing_checkout)
    if (action === 'all' || action === 'close') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('process_daily_attendance_close')
      if (error) {
        console.error('Error in process_daily_attendance_close:', error)
      } else {
        closeResult = data
      }
    }

    // 2. Process daily absences (mark absent for previous working day with no punches)
    if (action === 'all' || action === 'absences') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('process_daily_attendance_absences')
      if (error) {
        console.error('Error in process_daily_attendance_absences:', error)
      } else {
        absenceResult = data
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      closeResult,
      absenceResult,
      timestamp: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cron execution failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
