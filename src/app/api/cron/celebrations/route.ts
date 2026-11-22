import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCelebrationEmail } from '@/lib/email/send-email'

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

  try {
    const supabase = createAdminClient()

    // Check company settings for celebration email toggle
    const { data: settings } = await supabase
      .from('company_settings')
      .select('celebration_emails_enabled')
      .maybeSingle()

    const emailsEnabled = settings?.celebration_emails_enabled ?? true

    // Process daily celebrations in database (creates in-app notifications & reminders)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawCelebrants, error: rpcError } = await (supabase.rpc as any)(
      'process_daily_celebrations'
    )

    if (rpcError) {
      console.error('Error in process_daily_celebrations RPC:', rpcError)
      return NextResponse.json(
        { error: 'Failed to process daily celebrations', details: rpcError.message },
        { status: 500 }
      )
    }

    const celebrants = Array.isArray(rawCelebrants) ? rawCelebrants : []
    const emailResults: { user_id: string; success: boolean; error?: string }[] = []

    // If emails are enabled, dispatch branded celebration email via Resend
    if (emailsEnabled) {
      for (const celebrant of celebrants) {
        if (celebrant.email) {
          const res = await sendCelebrationEmail({
            to: celebrant.email,
            fullName: celebrant.full_name,
            kind: celebrant.kind,
            years: celebrant.years,
          })
          emailResults.push({
            user_id: celebrant.user_id,
            success: res.success,
            error: res.error,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      celebrants_count: celebrants.length,
      emails_enabled: emailsEnabled,
      email_dispatches: emailResults,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('Unhandled error in /api/cron/celebrations:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
