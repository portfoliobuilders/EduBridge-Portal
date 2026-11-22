import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { celebration_emails_enabled: false },
          error: null,
        }),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: [],
      error: null,
    }),
  })),
}))

import { GET } from './route'

describe('Celebrations Cron Route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret-cron-key-123'
  })

  it('rejects calls without secret with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/celebrations', {
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toContain('Unauthorized')
  })

  it('rejects calls with invalid secret with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/celebrations', {
      method: 'GET',
      headers: {
        authorization: 'Bearer wrong-secret',
      },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid Authorization Bearer secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/celebrations', {
      method: 'GET',
      headers: {
        authorization: 'Bearer super-secret-cron-key-123',
      },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.celebrants_count).toBe(0)
  })
})
