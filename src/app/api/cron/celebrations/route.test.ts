import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
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
})
