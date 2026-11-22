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

test.describe('Candidates Directory Redesign E2E', () => {
  test.describe.configure({ timeout: 60000 });

  const runId = Date.now();
  const testEmail = `candidates_test_${runId}@test.edubridge.local`;
  const password = `CandidatePass_${runId}!Aa1`;
  let testUserId: string;

  test.beforeAll(async () => {
    const { data: userData, error: userErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: `Candidate QA Tester ${runId}` },
    });
    if (userErr || !userData.user) throw userErr || new Error('Test user creation failed');
    testUserId = userData.user.id;

    await adminClient
      .from('profiles')
      .update({
        role: 'owner',
        is_active: true,
        full_name: `Candidate QA Tester ${runId}`,
        job_title: 'Senior Admissions Officer',
      })
      .eq('id', testUserId);
  });

  test.afterAll(async () => {
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId);
    }
  });

  test('1. Desktop Candidates Directory: KPI strip, URL filters, status tabs, selection & row navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 850 });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Navigate to candidates
    await page.goto('/candidates');
    await page.waitForLoadState('networkidle');

    // Header check
    await expect(page.locator('h1:has-text("Candidates")')).toBeVisible();
    await expect(page.locator('button:has-text("New candidate")')).toBeVisible();
    await expect(page.locator('button:has-text("Export")')).toBeVisible();

    // KPI strip check (4 cards)
    await expect(page.getByRole('button', { name: /Total Candidates/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Outstanding Balance/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Collected this Month/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Fully paid.*Zero balance/i })).toBeVisible();

    // Status tabs with count badges
    const allTab = page.locator('button[role="tab"]:has-text("All")');
    await expect(allTab).toBeVisible();

    const balanceDueTab = page.locator('button[role="tab"]:has-text("Balance due")');
    await expect(balanceDueTab).toBeVisible();

    // Click Balance due status tab -> URL updates
    await balanceDueTab.click();
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain('status=balance_due');

    // Search filter input -> debounced URL update
    const searchInput = page.locator('input[placeholder*="Search by candidate name"]');
    await searchInput.fill('Fatima');
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain('q=Fatima');

    // Clear search
    const clearSearchBtn = page.locator('button[aria-label="Clear search"]');
    if (await clearSearchBtn.isVisible()) {
      await clearSearchBtn.click();
      await expect.poll(() => page.url(), { timeout: 5000 }).not.toContain('q=Fatima');
    }

    // Switch back to All tab
    await allTab.click();
    await expect.poll(() => page.url(), { timeout: 5000 }).not.toContain('status=');

    // Table rows check
    const rows = page.locator('tbody tr[role="link"]');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Test selection and Bulk Action Bar
    const firstCheckbox = page.locator('tbody tr input[type="checkbox"]').first();
    await firstCheckbox.check();
    await expect(page.locator('text=candidate selected')).toBeVisible();
    await expect(page.locator('button:has-text("Send WhatsApp reminders")')).toBeVisible();
    await expect(page.locator('button:has-text("Clear selection")')).toBeVisible();

    // Clear selection
    await page.locator('button:has-text("Clear selection")').click();
    await expect(page.locator('text=candidate selected')).not.toBeVisible();

    // Test row navigation: click first row opens candidate profile
    const firstRow = rows.first();
    await firstRow.click();
    await page.waitForURL(/\/candidates\/[a-f0-9-]+/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/candidates\/[a-f0-9-]+/);
  });

  test('2. Mobile Candidates Directory (<1024px): Cards, Mobile Filter Sheet, Quick Actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Navigate to candidates
    await page.goto('/candidates');
    await page.waitForLoadState('networkidle');

    // In mobile, cards are visible and table is hidden
    const mobileCards = page.locator('div[role="link"].rounded-\\[14px\\]');
    await expect(mobileCards.first()).toBeVisible({ timeout: 10000 });

    // Mobile filter sheet button
    const filtersBtn = page.locator('button:has-text("Filters")');
    await expect(filtersBtn).toBeVisible();
    await filtersBtn.click();

    // Sheet should open
    await expect(page.locator('h2:has-text("Filter Candidates")')).toBeVisible();
    await expect(page.locator('label:has-text("University")')).toBeVisible();

    // Close sheet
    const closeBtn = page.locator('button:has-text("Apply Filters")');
    await closeBtn.click();
    await expect(page.locator('h2:has-text("Filter Candidates")')).not.toBeVisible();

    // Click candidate mobile card navigates to profile
    await mobileCards.first().click();
    await page.waitForURL(/\/candidates\/[a-f0-9-]+/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/candidates\/[a-f0-9-]+/);
  });
});
