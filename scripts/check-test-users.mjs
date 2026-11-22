#!/usr/bin/env node
/**
 * check-test-users.mjs
 * CI guard: fails with exit code 1 if any active or newly leaked
 * @test.edubridge.local user exists in auth.
 *
 * Usage: npx dotenvx run -f .env.local -- node scripts/check-test-users.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Historical deactivated test users with payments/FK records preserved for launch cleanup
const KNOWN_DEACTIVATED_TEST_USERS = new Set([
  'ffefb7d1-21a2-4fca-8509-5ccc4c89ad62',
  '0341782a-be9a-4f3a-92a2-20b8a7903885',
  '8d0f0924-0d58-4dc1-b756-c23a85f69ffa',
  '5890ee11-7950-4a6c-a83d-0f0fc45ae7b8',
  '526b95fe-e148-443e-82ec-75b62311be7e',
  'f5f128e9-aa57-4a18-86be-e1e8190bf41d',
  'b292fe85-df49-4e3d-97ad-54b3dfe3a525',
  'd44a9ad3-b2eb-425e-a424-71492a89ec1b',
  '00b81522-28d3-40e9-ba7a-a2c820c9efcd',
  '876bcd41-bc11-4905-aa78-8fd975abbd5a',
  'd2405339-1dd2-43fd-bc4b-048b5cfb300e',
  '71984497-fb0d-4242-87d0-6ecbcc824879',
  'db9aceb1-ae72-4a00-b496-fbea9625ce34',
  'b1cee8dd-5399-47e1-9020-d5d9781d3b8b',
  'bc33e4d0-1eb6-473e-9e75-15851af6137e',
  '7ceac5d3-51b5-47e0-aa0a-2fde458086e8',
  'e9b79b3f-53ff-446a-8af0-7ee827adcb8b',
  '27f8472f-ec07-4047-9785-a783668f0b7c',
  'b7de14bb-705b-4516-967f-eb28f0423bae',
  '8f1e5e31-765f-408d-836a-e1545b07c814',
  'df0fb55f-250a-441a-9a9b-f1c96ba7c302',
  '145978bf-a070-4780-bce4-550253ce1627',
])

async function main() {
  let allUsers = []
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) {
      console.error('listUsers error:', error.message)
      process.exit(1)
    }
    allUsers.push(...data.users)
    if (data.users.length < 100) break
    page++
  }

  const testUsers = allUsers.filter((u) => u.email?.endsWith('@test.edubridge.local'))

  // Fetch profile status
  const { data: profiles } = await admin.from('profiles').select('id, is_active, role')
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

  // Active test users (forbidden) or new unmanaged test users
  const activeOrLeaked = testUsers.filter((u) => {
    const prof = profileMap.get(u.id)
    if (prof?.is_active) return true
    return !KNOWN_DEACTIVATED_TEST_USERS.has(u.id)
  })

  if (activeOrLeaked.length > 0) {
    console.error(`❌ Found ${activeOrLeaked.length} active or unmanaged leaked test user(s):`)
    for (const u of activeOrLeaked) {
      const prof = profileMap.get(u.id)
      console.error(`  - ${u.email} (${u.id}) [active: ${prof?.is_active ?? 'unknown'}, role: ${prof?.role ?? 'unknown'}]`)
    }
    console.error('\nRun: npm run cleanup:test-users to clean them up.')
    process.exit(1)
  }

  console.log(`✅ No active or unmanaged test users found (${testUsers.length} historical FK-bound test users are safely deactivated).`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
