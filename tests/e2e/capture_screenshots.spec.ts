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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe('Capture Reference Removal Screenshots', () => {
  const runId = Date.now();
  const testEmail = `pw_screen_${runId}@test.edubridge.local`;
  const password = `ScreenPass_${runId}#123!`;
  let testUserId: string;

  let studentId: string;
  let paymentId: string;

  test.beforeAll(async () => {
    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: 'Screenshot Tester' },
    });
    if (userErr || !userData.user) throw userErr || new Error('User creation failed');
    testUserId = userData.user.id;

    await supabase
      .from('profiles')
      .update({ role: 'owner', is_active: true, full_name: 'Screenshot Tester' })
      .eq('id', testUserId);

    const { data: st } = await supabase.from('students').select('id, full_name').limit(1);
    const { data: p } = await supabase.from('payments').select('id, receipt_no, mode').limit(1);
    studentId = st?.[0]?.id || '';
    paymentId = p?.[0]?.id || '';
  });

  test.afterAll(async () => {
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  test('Capture 1280px Desktop and 375px Mobile screenshots', async ({ page }) => {
    // 1. Login Desktop
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });

    // 2. Navigate to /receipts/new
    await page.goto('/receipts/new');
    await page.waitForLoadState('networkidle');

    // Click "Bank Transfer"
    await page.click('button:has-text("Bank Transfer")');
    await page.waitForTimeout(500);

    // Verify no reference field
    await expect(page.locator('#referenceNo, input[placeholder*="reference"], input[placeholder*="approval"]')).toHaveCount(0);

    // Screenshot Desktop Bank Transfer
    await page.screenshot({
      path: 'docs/screenshots/payment_form_bank_transfer_1280.png',
      fullPage: false,
    });

    // Click "Payment Link"
    await page.click('button:has-text("Payment Link")');
    await page.waitForTimeout(500);
    await expect(page.locator('#referenceNo, input[placeholder*="reference"], input[placeholder*="approval"]')).toHaveCount(0);

    // Screenshot Desktop Payment Link
    await page.screenshot({
      path: 'docs/screenshots/payment_form_payment_link_1280.png',
      fullPage: false,
    });

    // 3. Switch to 375px mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // Mobile Payment Link
    await page.screenshot({
      path: 'docs/screenshots/payment_form_payment_link_375.png',
      fullPage: false,
    });

    // Mobile Bank Transfer
    await page.click('button:has-text("Bank Transfer")');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/payment_form_bank_transfer_375.png',
      fullPage: false,
    });

    // 4. Candidate Ledger
    if (studentId) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/candidates/${studentId}`);
      await page.waitForLoadState('networkidle');

      // Verify no "Reference" column in ledger table
      await expect(page.locator('th:has-text("Reference")')).toHaveCount(0);

      await page.screenshot({
        path: 'docs/screenshots/candidate_ledger_no_reference_1280.png',
        fullPage: false,
      });

      // Mobile Candidate Ledger
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'docs/screenshots/candidate_ledger_no_reference_375.png',
        fullPage: false,
      });
    }

    // 5. Receipt Detail
    if (paymentId) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/receipts/${paymentId}`);
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'docs/screenshots/receipt_detail_no_reference_1280.png',
        fullPage: false,
      });

      // Mobile Receipt Detail
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'docs/screenshots/receipt_detail_no_reference_375.png',
        fullPage: false,
      });
    }
  });
});
