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

test.describe('Admin Role Permissions & Scope E2E Scenario', () => {
  const runId = Date.now();
  const adminEmail = `admin_role_${runId}@test.edubridge.local`;
  const password = `AdminP@ss_${runId}!Aa1`;
  let adminUserId: string;
  let testPaymentId: string;

  test.beforeAll(async () => {
    // 1. Create disposable Admin user (scope: team)
    const { data: adminData, error: adminErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: `Admin Tester ${runId}` },
    });
    if (adminErr || !adminData.user) throw adminErr || new Error('Admin user creation failed');
    adminUserId = adminData.user.id;

    await adminClient
      .from('profiles')
      .update({
        role: 'admin',
        admin_scope: 'team',
        is_active: true,
        full_name: `Admin Tester ${runId}`,
      })
      .eq('id', adminUserId);

    // Ensure admins_can_void is false by default
    await adminClient
      .from('company_settings')
      .update({ admins_can_void: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Get an existing valid payment
    const { data: payments } = await adminClient
      .from('payments')
      .select('id')
      .eq('status', 'valid')
      .limit(1);
    testPaymentId = payments?.[0]?.id || '';
  });

  test.afterAll(async () => {
    if (adminUserId) {
      await adminClient.auth.admin.deleteUser(adminUserId);
    }
  });

  test('Admin scenario: Access staff console, blocked from settings, void restricted when admins_can_void=false', async ({
    page,
  }) => {
    // 1. Admin login
    await page.goto('/login');
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).not.toContain('/login');

    // 2. Admin can access /admin/staff
    await page.goto('/admin/staff');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Staff Management' })).toBeVisible({ timeout: 10000 });

    // 3. Admin is blocked from /admin/settings (Super Admin only)
    const settingsResp = await page.goto('/admin/settings');
    const is404 = settingsResp ? settingsResp.status() === 404 : false;
    const has404Text = (await page.locator('text=404, text=This page could not be found').count()) > 0;
    expect(is404 || has404Text).toBeTruthy();

    // 4. Admin cannot void receipt when admins_can_void = false
    if (testPaymentId) {
      await page.goto(`/receipts/${testPaymentId}`);
      await page.waitForLoadState('networkidle');
      const voidBtn = page.locator('button:has-text("Void Receipt")');
      await expect(voidBtn).toHaveCount(0);
    }
  });
});
