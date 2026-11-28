import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const env: Record<string, string> = {}
envFile.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    let value = match[2] || ''
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    env[match[1]] = value.trim()
  }
})

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Dialogs & Quick-Add Candidate Verification', () => {
  const runId = Date.now()
  const staffEmail = `dlg_staff_${runId}@test.edubridge.local`
  const saEmail = `dlg_sa_${runId}@test.edubridge.local`
  const celEmail = `dlg_cel_${runId}@test.edubridge.local`
  const pw = `Dlg_${crypto.randomBytes(12).toString('hex')}!1`

  let staffId: string
  let saId: string
  let celId: string
  let createdStudentId: string | null = null

  test.beforeAll(async () => {
    const now = new Date()
    const dubaiParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dubai',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now)
    const month = Number(dubaiParts.find((p) => p.type === 'month')?.value || 1)
    const day = Number(dubaiParts.find((p) => p.type === 'day')?.value || 1)

    const { data: st } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: 'Dialog Staff' },
    })
    staffId = st.user!.id
    await admin.from('profiles').update({ role: 'staff', is_active: true }).eq('id', staffId)

    const { data: sa } = await admin.auth.admin.createUser({
      email: saEmail,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: 'Dialog SuperAdmin' },
    })
    saId = sa.user!.id
    await admin.from('profiles').update({ role: 'super_admin', is_active: true }).eq('id', saId)

    const { data: cel } = await admin.auth.admin.createUser({
      email: celEmail,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: 'Dialog Celebrant' },
    })
    celId = cel.user!.id
    await admin.from('profiles').update({
      role: 'staff',
      is_active: true,
      birth_month: month,
      birth_day: day,
    }).eq('id', celId)
  })

  test.afterAll(async () => {
    if (createdStudentId) {
      await admin.rpc('delete_test_candidate', { p_student_id: createdStudentId })
    }
    for (const uid of [celId, staffId, saId].filter(Boolean)) {
      await admin.from('notifications').delete().eq('user_id', uid)
      await admin.from('profiles').delete().eq('id', uid)
      await admin.auth.admin.deleteUser(uid)
    }
  })

  test('1. Staff: /receipts/new -> + New Candidate -> creates & selects candidate, plus Attendance & Send Wish dialogs', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', staffEmail)
    await page.fill('input[type="password"]', pw)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

    // Send Wish dialog on Home
    const sendWishBtn = page.locator('button:has-text("Send Wish")').first()
    if (await sendWishBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sendWishBtn.click()
      await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible({ timeout: 5000 })
      await page.keyboard.press('Escape')
    }

    // /receipts/new -> + New Candidate
    await page.goto('/receipts/new')
    await page.waitForLoadState('networkidle')
    const quickAddBtn = page.locator('#btn-quick-add-candidate')
    await expect(quickAddBtn).toBeVisible({ timeout: 10000 })
    await quickAddBtn.click()

    const candName = `Dialog Candidate ${runId}`
    const candMobile = `50${String(runId).slice(-7)}`
    await expect(page.locator('#fullName')).toBeVisible({ timeout: 10000 })
    await page.fill('#fullName', candName)
    await page.fill('#mobile', candMobile)
    await page.locator('button:has-text("Next: Program & Fee")').click()

    await page.waitForSelector('#university', { timeout: 10000 })
    await page.locator('#university').click()
    await page.waitForSelector('[cmdk-item]', { timeout: 5000 })
    await page.locator('[cmdk-item]').first().click()

    const courseSelect = page.locator('#course')
    await expect(courseSelect).toBeEnabled({ timeout: 10000 })
    await courseSelect.click()
    await page.waitForSelector('[cmdk-item]', { timeout: 5000 })
    await page.locator('[cmdk-item]').first().click()

    await page.fill('#totalFee', '25000')
    await page.locator('button:has-text("Create Candidate & Enrollment")').click()

    // Should close sheet and select candidate in PaymentForm
    await expect(page.locator(`text=${candName}`).first()).toBeVisible({ timeout: 15000 })

    const { data: createdStu } = await admin
      .from('students')
      .select('id')
      .eq('full_name', candName)
      .single()
    createdStudentId = createdStu?.id || null

    // /attendance -> Apply Leave & Request Correction dialogs
    await page.goto('/attendance')
    await page.waitForLoadState('networkidle')
    const applyLeaveBtn = page.locator('button:has-text("Apply Leave")').first()
    await expect(applyLeaveBtn).toBeVisible({ timeout: 10000 })
    await applyLeaveBtn.click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')

    const reqCorrectionBtn = page.locator('button:has-text("Request Correction")').first()
    if (await reqCorrectionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reqCorrectionBtn.click()
      await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible({ timeout: 5000 })
      await page.keyboard.press('Escape')
    }
  })

  test('2. Super Admin: Invite Staff, Transfer, Upload Link, and Void dialogs open cleanly', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', saEmail)
    await page.fill('input[type="password"]', pw)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

    // Invite Staff ("Add Staff" button)
    await page.goto('/admin/staff')
    await page.waitForLoadState('networkidle')
    const inviteBtn = page.locator('button:has-text("Add Staff")').first()
    await expect(inviteBtn).toBeVisible({ timeout: 10000 })
    await inviteBtn.click()
    await expect(page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]').first()).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')

    // Candidate profile: Transfer, Upload Link, Void
    const { data: pmt } = await admin
      .from('payments')
      .select('id, student_id')
      .eq('status', 'valid')
      .limit(1)
      .single()

    if (pmt?.student_id) {
      await page.goto(`/candidates/${pmt.student_id}`)
      await page.waitForLoadState('networkidle')

      const transferBtn = page.locator('button:has-text("Transfer")').first()
      if (await transferBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await transferBtn.click()
        await expect(page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]').first()).toBeVisible({ timeout: 5000 })
        await page.keyboard.press('Escape')
      }

      const uploadLinkBtn = page.locator('button:has-text("Upload Link")').first()
      if (await uploadLinkBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await uploadLinkBtn.click()
        await expect(page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]').first()).toBeVisible({ timeout: 5000 })
        await page.keyboard.press('Escape')
      }

      const voidBtn = page.locator('button:has-text("Void")').first()
      if (await voidBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await voidBtn.click()
        await expect(page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]').first()).toBeVisible({ timeout: 5000 })
        await page.keyboard.press('Escape')
      }
    }
  })
})
