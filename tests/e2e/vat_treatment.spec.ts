import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { deleteTestCandidate } from '../helpers/test-candidate';

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

test.describe('VAT Treatment End-to-End Suite & Screenshot Capture', () => {
  test.describe.configure({ timeout: 120000 });

  const runId = Date.now();
  const testEmail = `vat_owner_${runId}@test.edubridge.local`;
  const password = `VatPass_${runId}!Aa1`;
  let testUserId: string;

  const createdStudentIds: string[] = [];

  let exclusiveStudentId: string;
  let exclusiveEnrollmentId: string;
  let exclusivePaymentId: string;
  let exclusiveShareToken: string;

  let inclusiveStudentId: string;
  let inclusivePaymentId: string;

  let noneStudentId: string;
  let nonePaymentId: string;

  test.beforeAll(async () => {
    const dir = path.resolve('docs/screenshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 1. Create owner test user
    const { data: userData, error: userErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: 'Fatima Al Nahyan' },
    });
    if (userErr || !userData.user) throw userErr || new Error('User creation failed');
    testUserId = userData.user.id;

    await adminClient
      .from('profiles')
      .update({
        role: 'owner',
        is_active: true,
        full_name: 'Fatima Al Nahyan',
        job_title: 'Admissions Director',
      })
      .eq('id', testUserId);

    // Create an authenticated client for test operations
    const userClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error: signInErr } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: password,
    });
    if (signInErr) throw signInErr;

    // Get an active university and course
    const { data: uni } = await adminClient
      .from('universities')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    const { data: course } = await adminClient
      .from('courses')
      .select('id, default_fee')
      .eq('university_id', uni!.id)
      .eq('is_active', true)
      .limit(1)
      .single();

    // 2. Pre-create Inclusive Candidate & Payment
    const incMobile = `+97150${Math.floor(1000000 + Math.random() * 9000000)}`;
    const { data: incRes, error: incErr } = await userClient.rpc('create_student_with_enrollment', {
      p_full_name: `Inclusive Candidate ${runId}`,
      p_mobile: incMobile,
      p_whatsapp: incMobile,
      p_university_id: uni!.id,
      p_course_id: course!.id,
      p_total_fee: 10000,
      p_discount: 0,
      p_vat_treatment: 'inclusive',
      p_vat_rate: 5,
      p_admission_staff_id: testUserId,
    });
    if (incErr) throw incErr;
    inclusiveStudentId = (incRes as { student_id: string }).student_id;
    const inclusiveEnrollmentId = (incRes as { enrollment_id: string }).enrollment_id;
    createdStudentIds.push(inclusiveStudentId);

    const { data: pInc, error: pIncErr } = await userClient.rpc('record_payment', {
      p_enrollment_id: inclusiveEnrollmentId,
      p_amount: 5000,
      p_mode: 'bank_transfer',
      p_purpose: 'admission',
      p_purpose_note: 'First installment inclusive',
      p_reference_no: null,
      p_paid_at: new Date().toISOString(),
      p_payee_name: 'Parent',
      p_comments: 'Inclusive VAT payment',
    });
    if (pIncErr) throw pIncErr;
    inclusivePaymentId = (pInc as { id: string }).id;

    // 3. Pre-create None (Zero-rated) Candidate & Payment
    const noneMobile = `+97150${Math.floor(1000000 + Math.random() * 9000000)}`;
    const { data: noneRes, error: noneErr } = await userClient.rpc('create_student_with_enrollment', {
      p_full_name: `None Candidate ${runId}`,
      p_mobile: noneMobile,
      p_whatsapp: noneMobile,
      p_university_id: uni!.id,
      p_course_id: course!.id,
      p_total_fee: 10000,
      p_discount: 0,
      p_vat_treatment: 'none',
      p_no_vat_reason: 'zero_rated',
      p_admission_staff_id: testUserId,
    });
    if (noneErr) throw noneErr;
    noneStudentId = (noneRes as { student_id: string }).student_id;
    const noneEnrollmentId = (noneRes as { enrollment_id: string }).enrollment_id;
    createdStudentIds.push(noneStudentId);

    const { data: pNone, error: pNoneErr } = await userClient.rpc('record_payment', {
      p_enrollment_id: noneEnrollmentId,
      p_amount: 5000,
      p_mode: 'cash',
      p_purpose: 'admission',
      p_purpose_note: 'Zero-rated fee payment',
      p_reference_no: null,
      p_paid_at: new Date().toISOString(),
      p_payee_name: 'Candidate',
      p_comments: 'Zero-rated VAT payment',
    });
    if (pNoneErr) throw pNoneErr;
    nonePaymentId = (pNone as { id: string }).id;
  });

  test.afterAll(async () => {
    for (const sid of createdStudentIds) {
      await deleteTestCandidate(adminClient, sid);
    }
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId);
    }
  });

  test('VAT Settings, Fee Entry, Locked State, Receipts, Tax Invoice, Reports & Screenshots', async ({
    page,
  }) => {
    // -------------------------------------------------------------------------
    // 1. Sign In
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect.poll(() => page.url(), { timeout: 15000 }).not.toContain('/login');

    // -------------------------------------------------------------------------
    // 2. Settings VAT Section (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.goto('/admin/settings');
    await page.waitForLoadState('networkidle');

    // Click Billing tab
    const billingTab = page.locator('button:has-text("Prefixes & VAT"), button:has-text("Billing")').first();
    await billingTab.click();
    await page.waitForTimeout(400);

    // Verify VAT Section controls
    await expect(page.locator('text=VAT Configuration')).toBeVisible();
    await expect(page.locator('text=Enable VAT on Receipts')).toBeVisible();
    await expect(page.locator('text=Default VAT Treatment')).toBeVisible();
    await expect(page.locator('button:has-text("+ VAT on top")')).toBeVisible();
    await expect(page.locator('button:has-text("Includes VAT")')).toBeVisible();
    await expect(page.locator('button:has-text("No VAT")')).toBeVisible();
    await expect(page.locator('text=Changing settings never changes existing enrollments')).toBeVisible();

    // Screenshot Settings Desktop 1280px
    await page.screenshot({
      path: 'docs/screenshots/vat_settings_1280.png',
      fullPage: false,
    });

    // Screenshot Settings Mobile 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'docs/screenshots/vat_settings_375.png',
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // 3. Fee Entry with Each Treatment + Live Breakdown (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/candidates');
    await page.waitForLoadState('networkidle');

    // Click "New candidate"
    const newCandBtn = page.locator('button:has-text("New candidate")');
    await newCandBtn.click();
    await page.waitForSelector('#fullName', { timeout: 10000 });

    // Step 1: Contact Details
    const candName = `Exclusive Candidate ${runId}`;
    const candMobile = `50${String(runId).slice(-7)}`;
    await page.fill('#fullName', candName);
    await page.fill('#mobile', candMobile);

    const nextBtn = page.locator('button:has-text("Next: Program & Fee")');
    await nextBtn.click();
    await page.waitForSelector('#university', { timeout: 10000 });

    // Step 2: Select University & Course
    const uniSelect = page.locator('#university');
    await uniSelect.click();
    await page.waitForSelector('[cmdk-item]', { timeout: 5000 });
    await page.locator('[cmdk-item]').first().click();

    const courseSelect = page.locator('#course');
    await expect(courseSelect).toBeEnabled({ timeout: 10000 });
    await courseSelect.click();
    await page.waitForSelector('[cmdk-item]', { timeout: 5000 });
    await page.locator('[cmdk-item]').first().click();

    // Enter fee 10,000
    await page.fill('#totalFee', '10000');
    await page.fill('#discount', '0');

    const sheet = page.locator('[data-slot="sheet-content"]');

    // Treatment A: "+ VAT on top" (Exclusive)
    const btnExclusive = sheet.locator('button:has-text("+ VAT on top")');
    await btnExclusive.click();
    await page.waitForTimeout(300);

    // Verify Exclusive Breakdown: Taxable 10,000, VAT 500, Total Payable 10,500
    await expect(sheet.locator('text=AED 10,500.00')).toBeVisible();
    await expect(sheet.locator('text=AED 500.00')).toBeVisible();

    // Screenshots: Exclusive Breakdown
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_exclusive_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_exclusive_375.png',
      fullPage: false,
    });

    // Treatment B: "Includes VAT" (Inclusive)
    await page.setViewportSize({ width: 1280, height: 850 });
    const btnInclusive = sheet.locator('button:has-text("Includes VAT")');
    await btnInclusive.click();
    await page.waitForTimeout(300);

    // Verify Inclusive Breakdown: Taxable 9,523.81, VAT 476.19, Total Payable 10,000
    await expect(sheet.locator('text=AED 9,523.81')).toBeVisible();
    await expect(sheet.locator('text=AED 476.19')).toBeVisible();

    // Screenshots: Inclusive Breakdown
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_inclusive_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_inclusive_375.png',
      fullPage: false,
    });

    // Treatment C: "No VAT"
    await page.setViewportSize({ width: 1280, height: 850 });
    const btnNone = sheet.locator('button:has-text("No VAT")');
    await btnNone.click();
    await page.waitForTimeout(300);

    // Verify reason select appears & Breakdown: VAT AED 0.00, Total Payable 10,000
    await expect(sheet.locator('#noVatReason')).toBeVisible();
    await expect(sheet.locator('text=AED 0.00 (Zero-rated)')).toBeVisible();

    // Screenshots: None Breakdown
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_none_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_none_375.png',
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // 4. Complete Candidate Creation with "+ VAT on top" (Exclusive)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await btnExclusive.click();
    await page.waitForTimeout(300);

    const submitBtn = sheet.locator('button:has-text("Create Candidate & Enrollment")');
    await submitBtn.click();

    // Verify Success Screen & click View Candidate Ledger
    await page.waitForSelector('#btn-view-candidate-ledger', { timeout: 15000 });
    await page.click('#btn-view-candidate-ledger');
    await expect.poll(() => page.url(), { timeout: 15000 }).toMatch(/\/candidates\/[0-9a-f-]{36}/i);
    await page.waitForLoadState('networkidle');

    // Extract studentId from URL
    const studentUrl = page.url();
    const parts = studentUrl.split('/');
    exclusiveStudentId = parts[parts.length - 1].split('?')[0];
    createdStudentIds.push(exclusiveStudentId);

    // Verify Candidate Detail KPI cards:
    // Total Payable AED 10,500.00 with "incl. VAT AED 500.00 (5%)"
    await expect(page.locator('text=AED 10,500.00').first()).toBeVisible();
    await expect(page.locator('text=incl. VAT AED 500.00 (5%)').first()).toBeVisible();

    // Fetch enrollment ID and share_token from DB
    const { data: enrData } = await adminClient
      .from('enrollments')
      .select('id, share_token')
      .eq('student_id', exclusiveStudentId)
      .single();
    exclusiveEnrollmentId = enrData!.id;
    exclusiveShareToken = enrData!.share_token;

    // -------------------------------------------------------------------------
    // 5. Record Payment of AED 5,000
    // -------------------------------------------------------------------------
    await page.goto(`/receipts/new?enrollment=${exclusiveEnrollmentId}`);
    await page.waitForLoadState('networkidle');

    // Verify Sticky Summary Card shows VAT calculation on the fly
    await page.fill('#amount', '5000');
    await page.waitForTimeout(400);

    // 5000 * 5 / 105 = 238.10
    await expect(page.locator('text=of which VAT (5%):').first()).toBeVisible();
    await expect(page.locator('div:has-text("of which VAT (5%):")').locator('text=AED 238.10').first()).toBeVisible();

    // Select mode and submit
    const submitPaymentBtn = page.locator('#btn-issue-receipt');
    await submitPaymentBtn.click();
    await expect.poll(() => page.url(), { timeout: 15000 }).toMatch(/\/receipts\/[0-9a-f-]{36}/i);

    // Extract payment ID
    const receiptUrl = page.url();
    const rParts = receiptUrl.split('/');
    exclusivePaymentId = rParts[rParts.length - 1].split('?')[0];

    // -------------------------------------------------------------------------
    // 6. Verify Receipt Detail & Capture Screenshots (Exclusive)
    // -------------------------------------------------------------------------
    await page.goto(`/receipts/${exclusivePaymentId}`);
    await page.waitForLoadState('networkidle');

    // Verify VAT lines
    await expect(page.locator('text=Amount received (incl. VAT 5%)')).toBeVisible();
    await expect(page.locator('text=of which VAT: AED 238.10')).toBeVisible();
    await expect(page.locator('text=Taxable: AED 4,761.90')).toBeVisible();

    // Screenshots: Exclusive Receipt
    await page.screenshot({
      path: 'docs/screenshots/receipt_exclusive_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/receipt_exclusive_375.png',
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // 7. Verify Locked State on Adjust Fee Modal (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(`/candidates/${exclusiveStudentId}`);
    await page.waitForLoadState('networkidle');

    // Click "Adjust Fee / Discount"
    const adjustFeeBtn = page.locator('button:has-text("Adjust Fee / Discount")');
    await adjustFeeBtn.click();
    await page.waitForSelector('span:has-text("Locked")', { timeout: 8000 });

    // Verify locked badge and disabled buttons
    await expect(page.locator('span:has-text("Locked")')).toBeVisible();
    await expect(page.locator('[title*="VAT treatment is locked"]')).toBeVisible();
    const lockedBtn = page.locator('button:has-text("+ VAT on top")').last();
    await expect(lockedBtn).toBeDisabled();

    // Screenshots: Locked State
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_locked_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/fee_entry_locked_375.png',
      fullPage: false,
    });

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // -------------------------------------------------------------------------
    // 8. Verify Tax Invoice Statement (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(`/r/statement/${exclusiveShareToken}`);
    await page.waitForLoadState('networkidle');

    // Verify TAX INVOICE title, TRN, and treatment note
    await expect(page.locator('text=TAX INVOICE').first()).toBeVisible();
    await expect(page.locator('text=105215478600003').first()).toBeVisible();
    await expect(page.locator('text=Prices exclusive of VAT').first()).toBeVisible();

    // Screenshots: Tax Invoice
    await page.screenshot({
      path: 'docs/screenshots/tax_invoice_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/tax_invoice_375.png',
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // 9. Verify & Capture Inclusive Receipt (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(`/receipts/${inclusivePaymentId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Amount received (incl. VAT 5%)')).toBeVisible();
    await expect(page.locator('text=of which VAT: AED 238.10')).toBeVisible();

    await page.screenshot({
      path: 'docs/screenshots/receipt_inclusive_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/receipt_inclusive_375.png',
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // 10. Verify & Capture None / Zero-Rated Receipt (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(`/receipts/${nonePaymentId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=VAT: Not applicable (Zero-rated)')).toBeVisible();

    await page.screenshot({
      path: 'docs/screenshots/receipt_none_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/receipt_none_375.png',
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // 11. Verify VAT Report & Capture Screenshots (1280px and 375px)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Click VAT Summary Tab
    const vatTab = page.locator('button:has-text("VAT Summary")');
    await vatTab.click();
    await page.waitForTimeout(600);

    // Verify VAT Report Cards
    await expect(page.locator('text=Total Taxable Base')).toBeVisible();
    await expect(page.locator('text=Total VAT Collected (5%)')).toBeVisible();

    // Screenshots: VAT Report
    await page.screenshot({
      path: 'docs/screenshots/vat_report_1280.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/vat_report_375.png',
      fullPage: false,
    });
  });
});
