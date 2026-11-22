import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn((fnName: string) => {
      if (fnName === 'process_daily_attendance_close') {
        return Promise.resolve({ data: { success: true, closed_sessions: 2 }, error: null })
      }
      if (fnName === 'process_daily_attendance_absences') {
        return Promise.resolve({ data: { success: true, absent_count: 1 }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
  })),
}))

describe('Attendance Cron Route', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret-attendance')
  })

  it('rejects unauthorized requests without valid secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/attendance')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('executes successfully with valid authorization header', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/attendance', {
      headers: {
        authorization: 'Bearer test-cron-secret-attendance',
      },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.closeResult).toEqual({ success: true, closed_sessions: 2 })
    expect(json.absenceResult).toEqual({ success: true, absent_count: 1 })
  })
})
