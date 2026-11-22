import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Login Full Redesign & Responsive Layout E2E', () => {
  const screenshotsDir = path.join(process.cwd(), 'docs', 'screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  const viewports = [
    { name: '320', width: 320, height: 568, isDesktop: false, screenshot: false },
    { name: '375', width: 375, height: 667, isDesktop: false, screenshot: true },
    { name: '768', width: 768, height: 1024, isDesktop: false, screenshot: true },
    { name: '1024', width: 1024, height: 768, isDesktop: true, screenshot: false },
    { name: '1280', width: 1280, height: 800, isDesktop: true, screenshot: false },
    { name: '1366x768', width: 1366, height: 768, isDesktop: true, screenshot: true },
    { name: '1440', width: 1440, height: 900, isDesktop: true, screenshot: false },
    { name: '1920', width: 1920, height: 1080, isDesktop: true, screenshot: true },
  ];

  for (const vp of viewports) {
    test(`Login layout at ${vp.name} (${vp.width}x${vp.height}): no overlap & no desktop scroll`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Verify sign in card elements are visible
      await expect(page.locator('h2:has-text("Sign in")')).toBeVisible();
      await expect(page.locator('input#email')).toBeVisible();
      await expect(page.locator('input#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]:has-text("Sign in")')).toBeVisible();

      // Check element overlap: Visible EduBridge logo must never overlap heading or form text
      const logos = await page.locator('img[alt*="EduBridge"]').all();
      for (const logo of logos) {
        if (await logo.isVisible()) {
          const logoBox = await logo.boundingBox();
          if (logoBox && logoBox.width > 0 && logoBox.height > 0) {
            const headings = await page.locator('h1, h2, form, label').all();
            for (const h of headings) {
              if (await h.isVisible()) {
                const hBox = await h.boundingBox();
                if (hBox && hBox.width > 0 && hBox.height > 0) {
                  const overlaps = !(
                    logoBox.x + logoBox.width <= hBox.x ||
                    hBox.x + hBox.width <= logoBox.x ||
                    logoBox.y + logoBox.height <= hBox.y ||
                    hBox.y + hBox.height <= logoBox.y
                  );
                  expect(overlaps).toBe(false);
                }
              }
            }
          }
        }
      }

      // Desktop >=1024: Ensure no vertical page scroll
      if (vp.isDesktop) {
        const { scrollHeight, clientHeight } = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        }));
        // Scroll height should equal or be strictly within client viewport height (<= 1px rounding tolerance)
        expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);

        // Verify 2-column structure
        const leftPanel = page.locator('h1:has-text("Receipt & Billing Management")');
        await expect(leftPanel).toBeVisible();

        // Verify 3 feature bullets on desktop
        await expect(page.getByText('Gapless receipts', { exact: true })).toBeVisible();
        await expect(page.getByText('Live candidate ledgers', { exact: true })).toBeVisible();
        await expect(page.getByText('Share via WhatsApp & email', { exact: true })).toBeVisible();
      }

      // Capture screenshot if requested
      if (vp.screenshot) {
        const shotPath = path.join(screenshotsDir, `login_${vp.name}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
      }
    });
  }

  test('Password eye toggle reveals and masks password', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input#password');
    await passwordInput.fill('AdminSecret#2026');

    // Default: type is password
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle button
    const toggleBtn = page.locator('button[aria-label*="password"]');
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
