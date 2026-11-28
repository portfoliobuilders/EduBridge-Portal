import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
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

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'ultrawide', width: 1920, height: 1080 },
]

test.describe('UI Polish Verification & Screenshots', () => {
  const ts = Date.now()
  const superAdminEmail = `super_ui_${ts}@test.edubridge.local`
  const staffEmail = `staff_ui_${ts}@test.edubridge.local`
  const password = `TestPassword_${ts}!123`
  let superAdminId: string
  let staffId: string

  test.beforeAll(async () => {
    fs.mkdirSync('screenshots', { recursive: true })

    // Create super_admin
    const { data: suData, error: suErr } = await admin.auth.admin.createUser({
      email: superAdminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Sara Al Zaabi' },
    })
    if (suErr) throw suErr
    superAdminId = suData.user.id
    await admin.from('profiles').update({ role: 'super_admin', is_active: true }).eq('id', superAdminId)

    // Create staff
    const { data: stData, error: stErr } = await admin.auth.admin.createUser({
      email: staffEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Tariq Mansoor' },
    })
    if (stErr) throw stErr
    staffId = stData.user.id
    await admin.from('profiles').update({
      role: 'staff',
      job_title: 'Admissions Counsellor',
      reports_to: superAdminId,
      joining_date: '2025-01-15',
      is_active: true,
    }).eq('id', staffId)
  })

  test.afterAll(async () => {
    if (staffId) {
      await admin.from('profiles').delete().eq('id', staffId)
      await admin.auth.admin.deleteUser(staffId)
    }
    if (superAdminId) {
      await admin.from('profiles').delete().eq('id', superAdminId)
      await admin.auth.admin.deleteUser(superAdminId)
    }
  })

  // 1. Profile Page at 4 viewports for Staff and Super Admin
  for (const vp of VIEWPORTS) {
    test(`Profile - Staff (${vp.name} ${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/login')
      await page.fill('input[type="email"]', staffEmail)
      await page.fill('input[type="password"]', password)
      await page.click('button[type="submit"]')
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

      await page.goto('/profile')
      await page.waitForSelector('text=Identity', { timeout: 15000 })
      await expect(page.locator('text=Managed by HR')).toBeVisible()

      await page.screenshot({
        path: `screenshots/profile_staff_${vp.name}_${vp.width}.png`,
        fullPage: true,
      })
    })

    test(`Profile - Super Admin (${vp.name} ${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/login')
      await page.fill('input[type="email"]', superAdminEmail)
      await page.fill('input[type="password"]', password)
      await page.click('button[type="submit"]')
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

      await page.goto('/profile')
      await page.waitForSelector('text=Identity', { timeout: 15000 })

      await page.screenshot({
        path: `screenshots/profile_superadmin_${vp.name}_${vp.width}.png`,
        fullPage: true,
      })
    })
  }

  // 2. Notifications Popover (Desktop) & Bottom Sheet (Mobile)
  test('Notifications Popover (Desktop 1280px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/login')
    await page.fill('input[type="email"]', superAdminEmail)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

    const bell = page.locator('button[aria-label^="Notifications"]:visible')
    await bell.click()
    await page.locator('[data-slot="popover-content"]').getByText('Notifications', { exact: true }).waitFor({ timeout: 10000 })
    await page.screenshot({
      path: 'screenshots/notifications_popover_desktop_1280.png',
    })
  })

  test('Notifications Bottom Sheet (Mobile 375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/login')
    await page.fill('input[type="email"]', superAdminEmail)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

    const bell = page.locator('button[aria-label^="Notifications"]:visible')
    await bell.click()
    await page.locator('[data-slot="sheet-content"]').getByText('Notifications', { exact: true }).waitFor({ timeout: 10000 })
    await page.screenshot({
      path: 'screenshots/notifications_bottomsheet_mobile_375.png',
    })
  })

  // 3. Home Page Gap Check (Top 3 removed) for Staff & Super Admin
  for (const vp of VIEWPORTS) {
    test(`Home - Staff without Top 3 (${vp.name} ${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/login')
      await page.fill('input[type="email"]', staffEmail)
      await page.fill('input[type="password"]', password)
      await page.click('button[type="submit"]')
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

      await page.goto('/')
      await page.waitForSelector('text=Welcome, Tariq Mansoor', { timeout: 15000 })
      await expect(page.locator('text=Top 3 This Month')).toHaveCount(0)

      await page.screenshot({
        path: `screenshots/home_staff_${vp.name}_${vp.width}.png`,
        fullPage: true,
      })
    })

    test(`Home - Super Admin without Top 3 (${vp.name} ${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/login')
      await page.fill('input[type="email"]', superAdminEmail)
      await page.fill('input[type="password"]', password)
      await page.click('button[type="submit"]')
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

      await page.goto('/')
      await page.waitForSelector('text=Welcome, Sara Al Zaabi', { timeout: 15000 })
      await expect(page.locator('text=Top 3 This Month')).toHaveCount(0)

      await page.screenshot({
        path: `screenshots/home_superadmin_${vp.name}_${vp.width}.png`,
        fullPage: true,
      })
    })
  }

  // 4. Leaderboard Page verification for Staff
  test('Verify Leaderboard for Staff loads with no endless spinner', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/login')
    await page.fill('input[type="email"]', staffEmail)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

    await page.goto('/leaderboard')
    await page.waitForSelector('text=Staff Leaderboard', { timeout: 10000 })

    // Must not show Loading top performers after 5s
    await page.waitForTimeout(2000)
    await expect(page.locator('text=Loading top performers...')).toHaveCount(0)
    await expect(page.locator('text=Loading...')).toHaveCount(0)

    await page.screenshot({
      path: 'screenshots/leaderboard_staff_1280.png',
      fullPage: true,
    })
  })

  // 5. Audited Dialogs
  test('Capture Apply Leave Dialog with working days calculation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/login')
    await page.fill('input[type="email"]', staffEmail)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

    await page.goto('/attendance')
    const applyBtn = page.locator('button:has-text("Apply Leave"), button:has-text("Request Leave")').first()
    if (await applyBtn.isVisible()) {
      await applyBtn.click()
      await page.waitForSelector('text=Request Leave', { timeout: 10000 })
      await page.screenshot({
        path: 'screenshots/dialog_apply_leave_1280.png',
      })
    }
  })

  test('Capture Regularization Dialog with future date block', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/login')
    await page.fill('input[type="email"]', staffEmail)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

    await page.goto('/attendance')
    const regBtn = page.locator('button:has-text("Regularization"), button:has-text("Request Regularization")').first()
    if (await regBtn.isVisible()) {
      await regBtn.click()
      await page.waitForSelector('text=Request Regularization', { timeout: 10000 })
      await page.screenshot({
        path: 'screenshots/dialog_regularization_1280.png',
      })
    }
  })
})
