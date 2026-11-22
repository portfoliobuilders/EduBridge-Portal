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

test.describe('Capture Candidates Redesign Screenshots', () => {
  test.describe.configure({ timeout: 90000 });

  const runId = Date.now();
  const testEmail = `candidates_shot_${runId}@test.edubridge.local`;
  const password = `ShotPass_${runId}!Aa1`;
  let testUserId: string;

  const viewports = [
    { name: '375', width: 375, height: 812 },
    { name: '768', width: 768, height: 1024 },
    { name: '1280', width: 1280, height: 850 },
    { name: '1536', width: 1536, height: 960 },
  ];

  test.beforeAll(async () => {
    const dir = path.resolve('docs/screenshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: 'Fatima Al Nahyan' },
    });
    if (userErr || !userData.user) throw userErr || new Error('User creation failed');
    testUserId = userData.user.id;

    await supabase
      .from('profiles')
      .update({
        role: 'owner',
        is_active: true,
        full_name: 'Fatima Al Nahyan',
        job_title: 'Admissions Director',
      })
      .eq('id', testUserId);
  });

  test.afterAll(async () => {
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  for (const vp of viewports) {
    test(`Capture Candidates Screenshots @ ${vp.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Sign in
      await page.goto('/login');
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

      // 2. Default Candidates List
      await page.goto('/candidates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `docs/screenshots/candidates-default-${vp.name}.png`,
        fullPage: false,
      });

      // 3. Filtered list (Balance due)
      await page.goto('/candidates?status=Balance+due');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await page.screenshot({
        path: `docs/screenshots/candidates-filtered-balance-due-${vp.name}.png`,
        fullPage: false,
      });

      // 4. Selection bar (select first item)
      await page.goto('/candidates');
      await page.waitForLoadState('networkidle');

      const isMobile = vp.width < 1024;
      if (!isMobile) {
        const checkbox = page.locator('tbody tr input[type="checkbox"]').first();
        if (await checkbox.isVisible()) {
          await checkbox.check();
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `docs/screenshots/candidates-selection-bar-${vp.name}.png`,
            fullPage: false,
          });
        }
      }

      // 5. No results state
      await page.goto('/candidates?q=NonExistentSearchQueryXYZ999');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      await page.screenshot({
        path: `docs/screenshots/candidates-no-results-${vp.name}.png`,
        fullPage: false,
      });

      // 6. Mobile filters sheet (at 375px)
      if (vp.name === '375') {
        await page.goto('/candidates');
        await page.waitForLoadState('networkidle');
        const filtersBtn = page.locator('button:has-text("Filters")');
        if (await filtersBtn.isVisible()) {
          await filtersBtn.click();
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `docs/screenshots/candidates-mobile-filters-sheet-375.png`,
            fullPage: false,
          });
          const doneBtn = page.locator('button:has-text("Apply Filters")');
          if (await doneBtn.isVisible()) await doneBtn.click();
        }
      }
    });
  }

  test('Capture Sidebar User Card @ 1280px & 1024px', async ({ page }) => {
    // 1280px
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const userCard = page.locator('aside div.border-t.border-\\[\\#E4E7E7\\]');
    if (await userCard.isVisible()) {
      await userCard.screenshot({
        path: 'docs/screenshots/sidebar-user-card-1280.png',
      });
    }

    // 1024px
    await page.setViewportSize({ width: 1024, height: 850 });
    await page.waitForTimeout(300);
    if (await userCard.isVisible()) {
      await userCard.screenshot({
        path: 'docs/screenshots/sidebar-user-card-1024.png',
      });
    }
  });
});
