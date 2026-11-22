import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe('Staff Leaderboard E2E & API Verification', () => {
  const runId = Date.now();
  const staffEmail = `lb_staff_${runId}@test.edubridge.local`;
  const adminEmail = `lb_admin_${runId}@test.edubridge.local`;
  const staffPass = `StaffPass_${runId}!Aa1`;
  const adminPass = `AdminPass_${runId}!Aa1`;

  let staffId: string;
  let adminId: string;

  test.beforeAll(async () => {
    // 1. Create Staff User
    const { data: staffData, error: staffErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password: staffPass,
      email_confirm: true,
      user_metadata: { full_name: `Counsellor LB ${runId}` },
    });
    if (staffErr || !staffData.user) throw staffErr || new Error('Staff creation failed');
    staffId = staffData.user.id;

    await adminClient
      .from('profiles')
      .update({
        full_name: `Counsellor LB ${runId}`,
        role: 'staff',
        job_title: 'Education Counsellor',
        is_active: true,
      })
      .eq('id', staffId);

    // 2. Create Admin User
    const { data: adminData, error: adminErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { full_name: `Admin Manager ${runId}` },
    });
    if (adminErr || !adminData.user) throw adminErr || new Error('Admin creation failed');
    adminId = adminData.user.id;

    await adminClient
      .from('profiles')
      .update({
        full_name: `Admin Manager ${runId}`,
        role: 'super_admin',
        job_title: 'Admissions Director',
        is_active: true,
      })
      .eq('id', adminId);

    // Ensure default setting: show_aed_to_staff = false
    await adminClient.from('company_settings').update({ show_aed_to_staff: false }).eq('singleton', true);
  });

  test.afterAll(async () => {
    // Revert settings to default and delete test users
    await adminClient.from('company_settings').update({ show_aed_to_staff: false }).eq('singleton', true);
    if (staffId) await adminClient.auth.admin.deleteUser(staffId);
    if (adminId) await adminClient.auth.admin.deleteUser(adminId);
  });

  test('1. API check: collections amounts are strictly NULL for staff when setting is off', async () => {
    // Sign in as staff with public anon client
    const staffAnon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data: authData, error: loginErr } = await staffAnon.auth.signInWithPassword({
      email: staffEmail,
      password: staffPass,
    });
    expect(loginErr).toBeNull();
    expect(authData.session).toBeTruthy();

    // Call get_staff_leaderboard RPC as staff when show_aed_to_staff is false
    const { data: lbData, error: lbErr } = await staffAnon.rpc('get_staff_leaderboard', {
      p_period: 'this_month',
      p_metric: 'collections',
    });
    expect(lbErr).toBeNull();
    expect(Array.isArray(lbData)).toBe(true);

    // Assert that every returned row has collections_amount === null at the API level
    for (const row of lbData) {
      expect(row.collections_amount).toBeNull();
      expect(row.value_delta).toBeNull();
    }

    // Now turn on show_aed_to_staff = true
    await adminClient.from('company_settings').update({ show_aed_to_staff: true }).eq('singleton', true);

    // Call again as staff
    const { data: lbDataEnabled } = await staffAnon.rpc('get_staff_leaderboard', {
      p_period: 'this_month',
      p_metric: 'collections',
    });
    expect(Array.isArray(lbDataEnabled)).toBe(true);

    // Reset back to false
    await adminClient.from('company_settings').update({ show_aed_to_staff: false }).eq('singleton', true);
  });

  test('2. Desktop UI at 1280px: Leaderboard page & captures screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Login as Admin
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', adminEmail);
    await page.fill('input[type="password"], input[name="password"]', adminPass);
    await page.click('button[type="submit"]');

    // Wait for Dashboard
    await page.waitForURL('**/', { timeout: 15000 });

    // Assert "Top 3 This Month" Dashboard widget is visible
    const widget = page.locator('text=Top 3 This Month').first();
    await expect(widget).toBeVisible();

    // Navigate to /leaderboard
    await page.goto('/leaderboard');
    await page.waitForSelector('text=Staff Leaderboard');

    // Assert Page title and periods
    await expect(page.locator('h1', { hasText: 'Staff Leaderboard' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'This Week' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'This Month' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'This Quarter' })).toBeVisible();

    // Switch metric to Collections
    await page.click('button:has-text("Collections (Net of Voids)")');
    await page.waitForTimeout(600);

    // Capture desktop screenshot
    fs.mkdirSync('tests/e2e/screenshots', { recursive: true });
    await page.screenshot({ path: 'tests/e2e/screenshots/leaderboard_desktop_1280.png', fullPage: true });
  });

  test('3. Mobile UI at 375px: Leaderboard page & captures screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Login as Staff
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', staffEmail);
    await page.fill('input[type="password"], input[name="password"]', staffPass);
    await page.click('button[type="submit"]');

    // Wait for home
    await page.waitForURL('**/', { timeout: 15000 });

    // Navigate to /leaderboard directly
    await page.goto('/leaderboard');
    await page.waitForSelector('text=Staff Leaderboard');

    // Switch period to "This Quarter"
    await page.click('button:has-text("This Quarter")');
    await page.waitForTimeout(600);

    // Capture mobile screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/leaderboard_mobile_375.png', fullPage: true });
  });
});
