import { test, expect, type Locator } from '@playwright/test';
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

test.describe('Opaque Surfaces & Dialogs Verification', () => {
  const runId = Date.now();
  const ownerEmail = `surface_owner_${runId}@test.edubridge.local`;
  const tempPassword = `SurfPass_${runId}!Aa1`;
  let ownerUserId: string;
  let testStudentId: string;
  let testPaymentId: string;

  test.beforeAll(async () => {
    // 1. Create owner user
    const { data: ownerData, error: ownerErr } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: `Surface Tester ${runId}` },
    });
    if (ownerErr || !ownerData.user) throw ownerErr || new Error('Owner user creation failed');
    ownerUserId = ownerData.user.id;

    await supabase
      .from('profiles')
      .update({ role: 'owner', is_active: true, full_name: `Surface Tester ${runId}` })
      .eq('id', ownerUserId);

    // Get an existing candidate and payment for testing modals
    const { data: students } = await supabase.from('students').select('id').limit(1);
    testStudentId = students?.[0]?.id || '';

    const { data: payments } = await supabase.from('payments').select('id').limit(1);
    testPaymentId = payments?.[0]?.id || '';
  });

  test.afterAll(async () => {
    if (ownerUserId) {
      await supabase.auth.admin.deleteUser(ownerUserId);
    }
  });

  test('Check opaque background-color (rgb(255, 255, 255)) on all dialogs and sheets', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', tempPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Helper to verify surface background
    const assertOpaqueWhite = async (locator: Locator, name: string) => {
      await expect(locator).toBeVisible({ timeout: 5000 });
      const bgColor = await locator.evaluate((el: HTMLElement) => {
        return window.getComputedStyle(el).backgroundColor;
      });
      console.log(`[Surface Check] ${name} computed background-color:`, bgColor);
      expect(bgColor, `${name} should have solid white background`).toBe('rgb(255, 255, 255)');
    };

    // --- 1. Create Candidate Sheet on /candidates ---
    await page.goto('/candidates');
    await page.waitForLoadState('networkidle');
    const newCandBtn = page.locator('button:has-text("New Candidate")').first();
    await newCandBtn.click();
    const sheetSurface = page.locator('[data-slot="sheet-content"]');
    await assertOpaqueWhite(sheetSurface, 'Create Candidate Sheet');

    // Check Step 2 Combobox popover surface
    await page.fill('#fullName', 'Surface Candidate');
    await page.fill('#mobile', '581234567');
    await page.click('button:has-text("Next: Program & Fee")');
    await page.waitForSelector('#university');
    await page.click('#university');
    const popoverSurface = page.locator('[data-slot="popover-content"]');
    await assertOpaqueWhite(popoverSurface, 'University Combobox Popover');
    await page.keyboard.press('Escape'); // close popover
    await page.keyboard.press('Escape'); // close sheet

    // --- 2. Modals on /candidates/[id] ---
    if (testStudentId) {
      await page.goto(`/candidates/${testStudentId}`);
      await page.waitForLoadState('networkidle');

      // Edit Candidate Modal
      const editCandBtn = page.locator('#btn-edit-student, button:has-text("Edit Candidate")').first();
      if (await editCandBtn.isVisible()) {
        await editCandBtn.click();
        const editDialog = page.locator('[data-slot="dialog-content"]');
        await assertOpaqueWhite(editDialog, 'Edit Candidate Dialog');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Add Enrollment Modal
      const addEnrBtn = page.locator('#btn-add-enrollment, button:has-text("Add Course / Program"), button:has-text("Add Enrollment")').first();
      if (await addEnrBtn.isVisible()) {
        await addEnrBtn.click();
        const enrDialog = page.locator('[data-slot="dialog-content"]');
        await assertOpaqueWhite(enrDialog, 'Add Enrollment Dialog');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Edit Fee Modal (if enrollment exists)
      const editFeeBtn = page.locator('button:has-text("Edit Fee"), button[aria-label="Edit Fee"]').first();
      if (await editFeeBtn.isVisible()) {
        await editFeeBtn.click();
        const feeDialog = page.locator('[data-slot="dialog-content"]');
        await assertOpaqueWhite(feeDialog, 'Edit Fee Dialog');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    // --- 3. Add Staff Sheet on /admin/staff ---
    await page.goto('/admin/staff');
    await page.waitForLoadState('networkidle');
    const addStaffBtn = page.locator('button:has-text("Add Staff Member"), button:has-text("Add Staff")').first();
    if (await addStaffBtn.isVisible()) {
      await addStaffBtn.click();
      const staffSheet = page.locator('[data-slot="sheet-content"]');
      await assertOpaqueWhite(staffSheet, 'Add Staff Sheet');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // --- 4. Void Receipt Dialog on /receipts/[id] ---
    if (testPaymentId) {
      await page.goto(`/receipts/${testPaymentId}`);
      await page.waitForLoadState('networkidle');
      const voidBtn = page.locator('button:has-text("Void Receipt")').first();
      if (await voidBtn.isVisible()) {
        await voidBtn.click();
        const voidDialog = page.locator('[data-slot="dialog-content"]');
        await assertOpaqueWhite(voidDialog, 'Void Receipt Dialog');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });
});
