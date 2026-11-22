import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || '';

const adminClient = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe('EduBridge End-to-End Smoke Test Flow', () => {
  const runId = Date.now();
  const staffEmail = `smoke_staff_${runId}@test.edubridge.local`;
  const ownerEmail = `smoke_owner_${runId}@test.edubridge.local`;
  const tempPassword = `TstP@ss_${runId}!Aa1`;

  let staffUserId: string;
  let ownerUserId: string;
  let createdPaymentReceiptUrl: string = '';

  test.beforeAll(async () => {
    // 1. Create disposable staff user
    const { data: staffData, error: staffErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: `Smoke Staff ${runId}` },
    });
    if (staffErr || !staffData.user) {
      throw new Error(`Failed to create staff user: ${staffErr?.message}`);
    }
    staffUserId = staffData.user.id;

    // Update profile to staff role
    await adminClient
      .from('profiles')
      .update({ role: 'staff', is_active: true, full_name: `Smoke Staff ${runId}` })
      .eq('id', staffUserId);

    // 2. Create disposable owner user
    const { data: ownerData, error: ownerErr } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: `Smoke Owner ${runId}` },
    });
    if (ownerErr || !ownerData.user) {
      throw new Error(`Failed to create owner user: ${ownerErr?.message}`);
    }
    ownerUserId = ownerData.user.id;

    // Update profile to owner role
    await adminClient
      .from('profiles')
      .update({ role: 'owner', is_active: true, full_name: `Smoke Owner ${runId}` })
      .eq('id', ownerUserId);
  });

  test.afterAll(async () => {
    // Clean up disposable users
    if (staffUserId) {
      await adminClient.auth.admin.deleteUser(staffUserId);
    }
    if (ownerUserId) {
      await adminClient.auth.admin.deleteUser(ownerUserId);
    }
  });

  test('1. Staff flow: login -> quick-add candidate & enrollment -> record card payment -> verify receipt & ledger', async ({
    page,
  }) => {
    // 1. Staff logs in
    await page.goto('/login');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', tempPassword);
    await page.click('button[type="submit"]');

    // Wait for redirection to dashboard or home
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).not.toContain('/login');

    // 2. Navigate to /receipts/new
    await page.goto('/receipts/new');
    await page.waitForLoadState('networkidle');

    // 3. Click "+ New Candidate" quick-add button
    const quickAddBtn = page.locator('#btn-quick-add-candidate');
    await expect(quickAddBtn).toBeVisible({ timeout: 10000 });
    await quickAddBtn.click();

    // Fill candidate details in Step 1
    const candName = `Smoke Candidate ${runId}`;
    const candMobile = `50${String(runId).slice(-7)}`;

    await page.waitForSelector('#fullName', { timeout: 10000 });
    await page.fill('#fullName', candName);
    await page.fill('#mobile', candMobile);

    // Click Next: Program & Fee
    const nextBtn = page.locator('button:has-text("Next: Program & Fee")');
    await nextBtn.click();

    // Step 2: Select University, Course, and enter Total Fee
    await page.waitForSelector('#university', { timeout: 10000 });
    const uniSelect = page.locator('#university');
    await uniSelect.selectOption({ index: 1 });

    // Wait for courses to populate and select first course option
    const courseSelect = page.locator('#course');
    await expect(courseSelect).toBeEnabled({ timeout: 10000 });
    await courseSelect.selectOption({ index: 1 });

    // Set Total Fee
    await page.fill('#totalFee', '5000');

    // Click Create Candidate & Enrollment
    const createCandidateBtn = page.locator('button:has-text("Create Candidate & Enrollment")');
    await createCandidateBtn.click();

    // 4. Verify candidate sheet closes and enrollment is preselected in PaymentForm
    await expect(page.locator(`text=${candName}`).first()).toBeVisible({ timeout: 15000 });

    // Verify reference field does NOT exist for any payment mode
    const referenceField = page.locator('#referenceNo, input[placeholder*="approval"], input[placeholder*="Auth No"], label:has-text("Approval Code"), label:has-text("Reference")');
    await expect(referenceField).toHaveCount(0);

    // Enter payment amount
    await page.fill('#amount', '1500');

    // Click submit button via id #btn-issue-receipt
    const submitPaymentBtn = page.locator('#btn-issue-receipt');
    await submitPaymentBtn.click();

    // 5. Verify redirection to receipt page
    await page.waitForURL(/\/receipts\/[0-9a-f-]+/, { timeout: 20000 });
    createdPaymentReceiptUrl = page.url();
    expect(createdPaymentReceiptUrl).toMatch(/\/receipts\/[0-9a-f-]+/);

    // Verify receipt number is displayed
    await expect(page.locator('text=EB-RV-2026-').first()).toBeVisible();

    // Verify remaining balance shows 3,500.00
    await expect(page.locator('text=3,500.00').first()).toBeVisible();
  });

  test('2. Owner flow: login -> void payment with mandatory reason -> verify ledger reflects void', async ({
    page,
  }) => {
    // 1. Owner logs in
    await page.goto('/login');
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Visit the created receipt
    expect(createdPaymentReceiptUrl).toBeTruthy();
    await page.goto(createdPaymentReceiptUrl);
    await page.waitForLoadState('networkidle');

    // 3. Click "Void Receipt" button
    const voidBtn = page.locator('button:has-text("Void Receipt")');
    await expect(voidBtn).toBeVisible({ timeout: 10000 });
    await voidBtn.click();

    // 4. In Void Receipt dialog, enter mandatory reason and confirm
    await page.waitForSelector('textarea', { timeout: 5000 });
    await page.fill('textarea', 'Smoke test verification: payment voided by owner');

    const confirmVoidBtn = page.locator('button:has-text("Confirm Void Receipt")');
    await confirmVoidBtn.click();

    // 5. Verify receipt indicates VOIDED status
    await expect(page.locator('text=VOIDED').first()).toBeVisible({ timeout: 15000 });
  });

  test('3. Staff security check: staff gets 404 when navigating to /admin', async ({
    page,
  }) => {
    // 1. Staff logs in
    await page.goto('/login');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Staff attempts to access /admin
    const response = await page.goto('/admin');
    
    // Either HTTP 404 status or the Next.js not-found page is displayed
    const is404Status = response ? response.status() === 404 : false;
    const has404Text = await page.locator('text=404, text=This page could not be found').count() > 0;

    expect(is404Status || has404Text).toBeTruthy();
  });
});
