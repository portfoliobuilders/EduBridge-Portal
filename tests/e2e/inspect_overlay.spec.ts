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

test('Verify /receipts/new fixes: no stray button, quick-add works, and clean console', async ({ page }) => {
  const runId = Date.now();
  const testEmail = `verify_fixes_${runId}@test.edubridge.local`;
  const password = `FixPass_${runId}#123!`;

  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: password,
    email_confirm: true,
    user_metadata: { full_name: 'Fix Tester' },
  });
  if (userErr || !userData.user) throw userErr || new Error('User creation failed');

  await supabase
    .from('profiles')
    .update({ role: 'owner', is_active: true, full_name: 'Fix Tester' })
    .eq('id', userData.user.id);

  const consoleWarnings: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  try {
    // 1. Log in
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Navigate to /receipts/new
    await page.goto('/receipts/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 3. Verify stray "New Candidate" button at the bottom of the panel is GONE
    const strayButton = page.locator('#btn-create-candidate-trigger');
    await expect(strayButton).toHaveCount(0);

    // 4. Verify "+ New Candidate" inside the "Candidate & Course Enrollment" card exists and opens sheet
    const cardQuickAddBtn = page.locator('#btn-quick-add-candidate');
    await expect(cardQuickAddBtn).toBeVisible();
    await cardQuickAddBtn.click();

    // Verify quick-add sheet is open
    const sheetTitle = page.locator('text=Create New Candidate');
    await expect(sheetTitle).toBeVisible({ timeout: 5000 });

    // Close the sheet
    await page.keyboard.press('Escape');
    await expect(sheetTitle).not.toBeVisible({ timeout: 5000 });

    // 5. Verify "+ Create …" option in empty search results works
    const searchInput = page.locator('input[placeholder*="Search candidate"]');
    await searchInput.fill('NonExistentCandidateXYZ99');
    await page.waitForTimeout(500);

    const createFromQueryBtn = page.locator('#btn-create-from-query');
    await expect(createFromQueryBtn).toBeVisible({ timeout: 5000 });
    await createFromQueryBtn.click();

    // Verify quick-add sheet opened with prefilled name
    await expect(sheetTitle).toBeVisible({ timeout: 5000 });
    const nameInput = page.locator('#fullName');
    await expect(nameInput).toHaveValue('NonExistentCandidateXYZ99');

    // Close the sheet
    await page.keyboard.press('Escape');
    await expect(sheetTitle).not.toBeVisible({ timeout: 5000 });

    // 6. Check console logs for Next.js image warnings or errors
    console.log('--- CONSOLE WARNINGS ---', consoleWarnings);
    console.log('--- CONSOLE ERRORS ---', consoleErrors);

    expect(consoleWarnings.filter((w) => w.includes('edubridge-logo'))).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);

    // 7. Capture screenshots required: 1280px + 375px
    // Desktop 1280px
    await page.setViewportSize({ width: 1280, height: 900 });
    await searchInput.fill('');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/receipts_new_desktop_1280.png',
      fullPage: false,
    });

    // Mobile 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/receipts_new_mobile_375.png',
      fullPage: false,
    });
  } finally {
    await supabase.auth.admin.deleteUser(userData.user.id);
  }
});
