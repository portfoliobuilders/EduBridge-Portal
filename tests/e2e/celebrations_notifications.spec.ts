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

test.describe('Notifications, Profiles, and Celebrations E2E', () => {
  const runId = Date.now();
  const celebrantEmail = `celebrant_${runId}@test.edubridge.local`;
  const colleagueEmail = `colleague_${runId}@test.edubridge.local`;
  const celebrantPass = `CelPass_${runId}!Aa1`;
  const colleaguePass = `ColPass_${runId}!Aa1`;

  let celebrantId: string;
  let colleagueId: string;
  let initialCelebrationsEnabled: boolean = false;

  // Format today's date in Asia/Dubai
  const now = new Date();
  const dubaiFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [dubaiYear, dubaiMonth, dubaiDay] = dubaiFormatter.format(now).split('-');
  const dobForToday = `1996-${dubaiMonth}-${dubaiDay}`;
  const joiningDateForAnniversary = `${Number(dubaiYear) - 2}-${dubaiMonth}-${dubaiDay}`;

  test.beforeAll(async () => {
    // 0. Save current celebrations setting and ensure celebrations are enabled in company_settings
    const { data: currSettings } = await adminClient
      .from('company_settings')
      .select('celebrations_enabled')
      .eq('singleton', true)
      .single();
    if (currSettings) {
      initialCelebrationsEnabled = Boolean(currSettings.celebrations_enabled);
    }

    await adminClient
      .from('company_settings')
      .update({ celebrations_enabled: true })
      .eq('singleton', true);

    // 1. Create Celebrant User
    const { data: celData, error: celErr } = await adminClient.auth.admin.createUser({
      email: celebrantEmail,
      password: celebrantPass,
      email_confirm: true,
      user_metadata: { full_name: `Celebrant Staff ${runId}` },
    });
    if (celErr || !celData.user) throw celErr || new Error('Celebrant creation failed');
    celebrantId = celData.user.id;

    await adminClient
      .from('profiles')
      .update({
        full_name: `Celebrant Staff ${runId}`,
        display_name: 'Celebrant',
        role: 'staff',
        job_title: 'Senior Education Counsellor',
        employee_id: `EB-STF-${runId.toString().slice(-4)}`,
        joining_date: joiningDateForAnniversary,
        celebrate_birthday: true,
        celebrate_anniversary: true,
        is_active: true,
      })
      .eq('id', celebrantId);

    // Save DOB in staff_sensitive_details
    await adminClient.from('staff_sensitive_details').upsert({
      user_id: celebrantId,
      dob: dobForToday,
    });

    // 2. Create Colleague User
    const { data: colData, error: colErr } = await adminClient.auth.admin.createUser({
      email: colleagueEmail,
      password: colleaguePass,
      email_confirm: true,
      user_metadata: { full_name: `Colleague Staff ${runId}` },
    });
    if (colErr || !colData.user) throw colErr || new Error('Colleague creation failed');
    colleagueId = colData.user.id;

    await adminClient
      .from('profiles')
      .update({
        full_name: `Colleague Staff ${runId}`,
        role: 'staff',
        job_title: 'Admissions Officer',
        is_active: true,
      })
      .eq('id', colleagueId);

    // 3. Seed an in-app notification for Celebrant
    await adminClient.rpc('create_notification', {
      p_user_id: celebrantId,
      p_type: 'celebration',
      p_title: 'Happy Birthday from EduBridge! 🎂',
      p_body: 'Wishing you a fantastic birthday and another amazing year ahead!',
      p_link: '/',
      p_entity_type: 'celebration',
      p_entity_id: celebrantId,
    });
  });

  test.afterAll(async () => {
    if (celebrantId) await adminClient.auth.admin.deleteUser(celebrantId);
    if (colleagueId) await adminClient.auth.admin.deleteUser(colleagueId);
    // Restore original celebrations_enabled setting
    await adminClient
      .from('company_settings')
      .update({ celebrations_enabled: initialCelebrationsEnabled })
      .eq('singleton', true);
  });

  test('Celebrant Experience: Top strip, hero card, notification bell, profile page', async ({
    page,
  }) => {
    page.on('pageerror', (err) => console.log('CLIENT PAGE ERROR:', err.message, err.stack));
    page.on('console', (msg) => console.log('CLIENT CONSOLE:', msg.text()));

    // 1. Log in as Celebrant
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await page.fill('input[type="email"]', celebrantEmail);
    await page.fill('input[type="password"]', celebrantPass);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Celebratory Top Strip present
    const topStrip = page.locator('[data-testid="celebrant-top-strip"]').first();
    await expect(topStrip).toBeVisible({ timeout: 10000 });

    // 3. Celebrant Hero Card on Home page
    const heroGreeting = page.getByRole('heading', { name: /Happy Birthday/i });
    await expect(heroGreeting).toBeVisible({ timeout: 10000 });

    // Capture Celebrant Desktop Screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/celebrant_desktop_1280.png',
      fullPage: false,
    });

    // 4. Test Mobile View (375px)
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('[data-testid="celebrant-top-strip"]:visible')).toBeVisible();
    await expect(heroGreeting).toBeVisible();

    await page.screenshot({
      path: 'tests/e2e/screenshots/celebrant_mobile_375.png',
      fullPage: false,
    });

    // Switch back to desktop for notification check
    await page.setViewportSize({ width: 1280, height: 800 });

    // 5. Notification Bell
    const bellBtn = page.locator('button[aria-label^="Notifications"]:visible').first();
    await expect(bellBtn).toBeVisible();
    await bellBtn.click();

    // Notification dropdown panel visible
    const notifPanel = page.locator('text=Notifications').first();
    await expect(notifPanel).toBeVisible({ timeout: 5000 });

    // 6. Navigation to /notifications
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    // 7. Navigation to /profile
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
    await expect(page.locator('text=Senior Education Counsellor').first()).toBeVisible(); // Admin locked job title rendered as read-only text

    // 8. Excluded check: /candidates must NOT show celebration banner for the celebrant themselves
    await page.goto('/candidates');
    await page.waitForLoadState('networkidle');
    const candidatesBanner = page.locator('div:has-text("It\'s Celebrant")');
    await expect(candidatesBanner).toHaveCount(0);
  });

  test('Colleague Experience: Banner, send wishes dialog, dismiss banner', async ({
    page,
  }) => {
    // 1. Log in as Colleague
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await page.fill('input[type="email"]', colleagueEmail);
    await page.fill('input[type="password"]', colleaguePass);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Colleague Banner appears
    const celebrationBanner = page.locator('[data-testid="celebration-banner"]');
    await expect(celebrationBanner).toBeVisible({ timeout: 10000 });

    // Capture Colleague Banner Screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/colleague_banner_desktop_1280.png',
      fullPage: false,
    });

    // 3. Click "Wish" button
    const sendWishesBtn = page.locator('button:has-text("Wish")').first();
    await expect(sendWishesBtn).toBeVisible();
    await sendWishesBtn.click();

    // Dialog opens
    await expect(page.getByRole('heading', { name: /Send Birthday Wishes/i })).toBeVisible();
    const wishInput = page.locator('textarea');
    await expect(wishInput).toBeVisible();
    await wishInput.fill('Wishing you a fantastic year filled with success! 🎉');

    // Post wish
    const postBtn = page.getByRole('button', { name: 'Send Wish' });
    await postBtn.click();

    // Success feedback
    await expect(page.locator('text=Wish sent')).toBeVisible({ timeout: 25000 });

    // 4. Test dismissing banner
    const dismissBtn = page.locator('button[aria-label="Dismiss celebration banner for today"]');
    await dismissBtn.click();
    await expect(celebrationBanner).toHaveCount(0);
  });

  test('Wishes Wall & Work Anniversary Variant Experience', async ({ page }) => {
    // 1. Celebrant logs in to see the incoming wish on the Hero card
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await page.fill('input[type="email"]', celebrantEmail);
    await page.fill('input[type="password"]', celebrantPass);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Verify wishes section is visible on Hero
    const wishesWall = page.locator('text=Wishes from colleagues');
    await expect(wishesWall).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: 'tests/e2e/screenshots/wishes_wall_desktop_1280.png',
      fullPage: false,
    });

    // 2. Switch Celebrant to Work Anniversary milestone only
    await adminClient
      .from('staff_sensitive_details')
      .update({ dob: null })
      .eq('user_id', celebrantId);

    await adminClient
      .from('profiles')
      .update({
        joining_date: `${Number(dubaiYear) - 3}-${dubaiMonth}-${dubaiDay}`,
      })
      .eq('id', celebrantId);

    // Reload page to reflect work anniversary
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const anniversaryHeading = page.locator('text=Work Anniversary');
    await expect(anniversaryHeading).toBeVisible({ timeout: 10000 });

    // Capture Work Anniversary Desktop Screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/anniversary_variant_1280.png',
      fullPage: false,
    });

    // Capture Work Anniversary Mobile Screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(anniversaryHeading).toBeVisible();

    await page.screenshot({
      path: 'tests/e2e/screenshots/anniversary_variant_mobile_375.png',
      fullPage: false,
    });
  });
});
