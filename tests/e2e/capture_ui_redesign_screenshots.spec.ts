import { test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

test.describe('Capture Comprehensive UI Redesign Screenshots', () => {
  const runId = Date.now();
  const testEmail = `pw_redesign_${runId}@test.edubridge.local`;
  const password = `RedesignPass_${runId}#123!`;
  let testUserId: string;

  let testStudentId: string;
  let testEnrollmentId: string;
  let testPaymentId: string;

  test.beforeAll(async () => {
    // Ensure docs/screenshots exists
    const dir = path.resolve('docs/screenshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: 'Redesign Auditor' },
    });
    if (userErr || !userData.user) throw userErr || new Error('User creation failed');
    testUserId = userData.user.id;

    await supabase
      .from('profiles')
      .update({ role: 'owner', is_active: true, full_name: 'Redesign Auditor' })
      .eq('id', testUserId);

    // Fetch existing candidate, enrollment, and payment
    const { data: students } = await supabase.from('students').select('id, full_name').limit(1);
    testStudentId = students?.[0]?.id || '';

    const { data: enrollments } = await supabase.from('enrollments').select('id, student_id').limit(1);
    testEnrollmentId = enrollments?.[0]?.id || '';

    const { data: payments } = await supabase.from('payments').select('id, receipt_no').limit(1);
    testPaymentId = payments?.[0]?.id || '';
  });

  test.afterAll(async () => {
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  const viewports = [
    { name: '375', width: 375, height: 812 },
    { name: '768', width: 768, height: 1024 },
    { name: '1280', width: 1280, height: 850 },
    { name: '1536', width: 1536, height: 960 },
  ];

  for (const vp of viewports) {
    test(`Capture screenshots for viewport ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Log in
      await page.goto('/login');
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });

      // 1. /receipts/new - Empty State
      await page.goto('/receipts/new');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `docs/screenshots/receipts_new_empty_${vp.name}.png`,
        fullPage: false,
      });

      // 2. /receipts/new - Candidate Selected (via URL preselection)
      if (testEnrollmentId) {
        await page.goto(`/receipts/new?enrollment=${testEnrollmentId}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);

        await page.screenshot({
          path: `docs/screenshots/receipts_new_selected_${vp.name}.png`,
          fullPage: false,
        });

        // 3. /receipts/new - Validation error (e.g. excessive amount)
        await page.fill('#amount', '9999999');
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `docs/screenshots/receipts_new_error_${vp.name}.png`,
          fullPage: false,
        });

        // Mobile sticky action bar specific screenshot
        if (vp.name === '375') {
          await page.screenshot({
            path: `docs/screenshots/receipts_new_mobile_sticky_bar_375.png`,
            fullPage: false,
          });
        }
      }

      // 4. Create Candidate Sheet - Step 1 & Step 2
      await page.goto('/candidates');
      await page.waitForLoadState('networkidle');
      const newCandBtn = page.locator('#btn-create-candidate-trigger');
      await newCandBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForSelector('#fullName', { timeout: 10000 });
      await page.screenshot({
        path: `docs/screenshots/create_candidate_step1_${vp.name}.png`,
        fullPage: false,
      });

      // Advance to Step 2
      await page.fill('#fullName', 'Amina Al-Mansouri');
      await page.fill('#mobile', '501234567');
      const nextBtn = page.locator('button:has-text("Next: Program & Fee")');
      await nextBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForSelector('#university', { timeout: 10000 });
      await page.screenshot({
        path: `docs/screenshots/create_candidate_step2_${vp.name}.png`,
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // 5. Candidate Detail Modals (Edit Candidate, Add Enrollment)
      if (testStudentId) {
        await page.goto(`/candidates/${testStudentId}`);
        await page.waitForLoadState('networkidle');

        // Edit Candidate Modal (showing national phone number once)
        const editBtn = page.locator('#btn-edit-student, button:has-text("Edit Candidate")').first();
        if (await editBtn.isVisible()) {
          await editBtn.evaluate((el: HTMLElement) => el.click());
          await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 8000 });
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `docs/screenshots/edit_candidate_modal_${vp.name}.png`,
            fullPage: false,
          });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }

        // Add Enrollment Modal (showing Combobox & prefilled fee)
        const addEnrBtn = page.locator('#btn-add-enrollment, button:has-text("Add Course / Program"), button:has-text("Add Enrollment")').first();
        if (await addEnrBtn.isVisible()) {
          await addEnrBtn.evaluate((el: HTMLElement) => el.click());
          await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 8000 });
          await page.waitForTimeout(300);
          // Click university combobox to select first university if available
          const uniCombobox = page.locator('[data-slot="dialog-content"] button[role="combobox"]').first();
          if (await uniCombobox.isVisible()) {
            await uniCombobox.evaluate((el: HTMLElement) => el.click());
            await page.waitForSelector('[cmdk-item]', { timeout: 5000 });
            await page.locator('[cmdk-item]').first().evaluate((el: HTMLElement) => el.click());
            await page.waitForTimeout(300);
          }

          await page.screenshot({
            path: `docs/screenshots/add_enrollment_modal_${vp.name}.png`,
            fullPage: false,
          });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      }

      // 6. Add Staff Sheet
      await page.goto('/admin/staff');
      await page.waitForLoadState('networkidle');
      const addStaffBtn = page.locator('button:has-text("Add Staff Member"), button:has-text("Add Staff")').first();
      if (await addStaffBtn.isVisible()) {
        await addStaffBtn.evaluate((el: HTMLElement) => el.click());
        await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 8000 });
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `docs/screenshots/add_staff_sheet_${vp.name}.png`,
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 7. Void Receipt Dialog
      if (testPaymentId) {
        await page.goto(`/receipts/${testPaymentId}`);
        await page.waitForLoadState('networkidle');
        const voidBtn = page.locator('button:has-text("Void Receipt")').first();
        if (await voidBtn.isVisible()) {
          await voidBtn.evaluate((el: HTMLElement) => el.click());
          await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 8000 });
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `docs/screenshots/void_dialog_${vp.name}.png`,
            fullPage: false,
          });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      }
    });
  }
});
