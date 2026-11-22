import { test, expect } from '@playwright/test';
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

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe('Sidebar Logo Height & Candidates Table Overflow Verification', () => {
  test.describe.configure({ timeout: 60000 });

  const runId = Date.now();
  const testEmail = `ui_verify_${runId}@test.edubridge.local`;
  const password = `UiVerifyPass_${runId}!Aa1`;
  let testUserId: string;
  const screenshotsDir = path.join(process.cwd(), 'docs', 'screenshots');

  test.beforeAll(async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const { data: userData, error: userErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: `UI Tester ${runId}` },
    });
    if (userErr || !userData.user) throw userErr || new Error('Test user creation failed');
    testUserId = userData.user.id;

    await adminClient
      .from('profiles')
      .update({
        role: 'owner',
        is_active: true,
        full_name: `UI Tester ${runId}`,
        job_title: 'Admissions Director',
      })
      .eq('id', testUserId);
  });

  test.afterAll(async () => {
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId);
    }
  });

  test('Sidebar logo bounding box height <= 40px on /, /candidates, /admin', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    const routes = ['/', '/candidates', '/admin'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // Desktop sidebar logo
      const desktopLogo = page.locator('aside img[alt="EduBridge Education"]');
      await expect(desktopLogo).toBeVisible();

      const box = await desktopLogo.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeLessThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(28); // Standardized to 32px
      }
    }
  });

  test('Candidates table overflow & column truncation at 1280 and 1920', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/candidates');
      await page.waitForLoadState('networkidle');

      // Verify table wrapper has NO horizontal scroll at 1280 and 1920
      const tableWrapper = page.locator('div.overflow-x-auto').first();
      await expect(tableWrapper).toBeVisible();

      const { scrollWidth, clientWidth } = await tableWrapper.evaluate((el: HTMLElement) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));

      // No horizontal scroll
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px margin of rounding

      // Verify Actions column is visible
      const actionsHeader = page.locator('th:has-text("Actions")');
      await expect(actionsHeader).toBeVisible();

      // Verify Checkbox is visible (not clipped)
      const selectAllCheckbox = page.locator('input[aria-label="Select all candidates on this page"]');
      await expect(selectAllCheckbox).toBeVisible();
      const checkboxBox = await selectAllCheckbox.boundingBox();
      const wrapperBox = await tableWrapper.boundingBox();
      if (checkboxBox && wrapperBox) {
        expect(checkboxBox.x).toBeGreaterThanOrEqual(wrapperBox.x);
      }

      // Capture screenshot
      const shotPath = path.join(screenshotsDir, `candidates_${width}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
    }
  });

  test('Capture app icon 512 and home-screen tile 60x60 screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1100 });
    await page.goto('/icon-preview.html');
    await page.waitForLoadState('networkidle');

    // Screenshot 512 icon
    const icon512El = page.locator('#icon-512-preview');
    await expect(icon512El).toBeVisible();
    await icon512El.screenshot({
      path: path.join(screenshotsDir, 'app_icon_512.png'),
    });

    // Screenshot home-screen tiles (iOS + Android at 60x60)
    const tilesSection = page.locator('#section-tiles');
    await expect(tilesSection).toBeVisible();
    await tilesSection.screenshot({
      path: path.join(screenshotsDir, 'app_icon_home_screen_tiles.png'),
    });
  });
});
