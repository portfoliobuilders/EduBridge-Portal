import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestCandidateWithEnrollment, deleteTestCandidate } from '../helpers/test-candidate';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || '';

const adminClient = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface RouteResult {
  role: string;
  route: string;
  status: number;
  expectedStatus: number;
  hasErrorBanner: boolean;
  consoleErrors: string[];
  pass: boolean;
}

const crawlResults: RouteResult[] = [];

test.describe('Role-based Route Crawl Matrix', () => {
  test.describe.configure({ mode: 'serial' });

  const runId = Date.now();
  const password = `Cr@wlPass_${runId}!Aa1`;

  const superAdminEmail = `crawl_super_admin_${runId}@test.edubridge.local`;
  const adminEmail = `crawl_admin_${runId}@test.edubridge.local`;
  const staffEmail = `crawl_staff_${runId}@test.edubridge.local`;

  let superAdminUserId: string;
  let adminUserId: string;
  let staffUserId: string;

  let testCandidateId: string;
  let testEnrollmentId: string;
  let testReceiptId: string;

  test.beforeAll(async () => {
    // 1. Create Super Admin
    const { data: saData, error: saErr } = await adminClient.auth.admin.createUser({
      email: superAdminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Crawl Super Admin ${runId}` },
    });
    if (saErr || !saData.user) throw saErr || new Error('Super admin user creation failed');
    superAdminUserId = saData.user.id;
    await adminClient
      .from('profiles')
      .update({ role: 'super_admin', is_active: true, admin_scope: 'company', full_name: `Crawl Super Admin ${runId}` })
      .eq('id', superAdminUserId);

    // 2. Create Admin (team scope)
    const { data: adData, error: adErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Crawl Admin ${runId}` },
    });
    if (adErr || !adData.user) throw adErr || new Error('Admin user creation failed');
    adminUserId = adData.user.id;
    await adminClient
      .from('profiles')
      .update({ role: 'admin', is_active: true, admin_scope: 'team', full_name: `Crawl Admin ${runId}` })
      .eq('id', adminUserId);

    // 3. Create Staff (reports to admin)
    const { data: stData, error: stErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Crawl Staff ${runId}` },
    });
    if (stErr || !stData.user) throw stErr || new Error('Staff user creation failed');
    staffUserId = stData.user.id;
    await adminClient
      .from('profiles')
      .update({
        role: 'staff',
        is_active: true,
        admin_scope: 'team',
        reports_to: adminUserId,
        full_name: `Crawl Staff ${runId}`,
      })
      .eq('id', staffUserId);

    // Also populate staff_sensitive_details for staffUserId
    await adminClient
      .from('staff_sensitive_details')
      .upsert({
        user_id: staffUserId,
        personal_email: `personal_${runId}@example.com`,
        dob: '1995-05-15',
        address: 'Dubai Silicon Oasis, Dubai',
        emergency_contact_name: 'Emergency Contact',
        emergency_contact_phone: '+971501234567',
      });

    // 4. Create authed client for staff to perform RPCs
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
    const staffAuthedClient = createClient(supabaseUrl, anonKey);
    const { error: loginErr } = await staffAuthedClient.auth.signInWithPassword({
      email: staffEmail,
      password,
    });
    if (loginErr) throw loginErr;

    // Create test candidate & enrollment assigned to staff user
    const candidate = await createTestCandidateWithEnrollment(staffAuthedClient, {
      fullName: `Crawl Candidate ${runId}`,
      staffUserId: staffUserId,
      email: staffEmail,
      password,
    });
    testCandidateId = candidate.studentId;
    testEnrollmentId = candidate.enrollmentId;

    // Ensure student owner_id is set to staffUserId so team admin & staff both have visibility
    await adminClient
      .from('students')
      .update({ owner_id: staffUserId })
      .eq('id', testCandidateId);

    // 5. Create test receipt (payment)
    const { data: pmtData, error: pmtErr } = await staffAuthedClient.rpc('record_payment', {
      p_enrollment_id: testEnrollmentId,
      p_amount: 1000,
      p_mode: 'bank_transfer',
      p_purpose: 'admission',
      p_purpose_note: 'Initial installment',
      p_reference_no: 'REF-CRAWL-001',
      p_paid_at: new Date().toISOString(),
      p_payee_name: 'Candidate Sponsor',
      p_comments: 'Route crawl test payment',
    });
    if (pmtErr || !pmtData) throw pmtErr || new Error('Failed to record test payment');
    testReceiptId = (pmtData as { id: string }).id;
  });

  test.afterAll(async () => {
    // Clean up candidate, payment, and test users
    if (testCandidateId) {
      await deleteTestCandidate(adminClient, testCandidateId);
    }
    if (staffUserId) {
      await adminClient.auth.admin.deleteUser(staffUserId);
    }
    if (adminUserId) {
      await adminClient.auth.admin.deleteUser(adminUserId);
    }
    if (superAdminUserId) {
      await adminClient.auth.admin.deleteUser(superAdminUserId);
    }

    // Print summary results table
    console.log('\n================ ROUTE CRAWL RESULTS TABLE ================');
    console.table(
      crawlResults.map((r) => ({
        Role: r.role,
        Route: r.route,
        Status: r.status,
        Expected: r.expectedStatus,
        'Has Error Banner': r.hasErrorBanner ? 'YES' : 'NO',
        'Console Errors': r.consoleErrors.length,
        Result: r.pass ? 'PASS' : 'FAIL',
      }))
    );
  });

  const getRoutes = () => [
    { path: '/', superAdmin: 200, admin: 200, staff: 200 },
    { path: '/candidates', superAdmin: 200, admin: 200, staff: 200 },
    { path: `/candidates/${testCandidateId}`, superAdmin: 200, admin: 200, staff: 200 },
    { path: '/receipts/new', superAdmin: 200, admin: 200, staff: 200 },
    { path: `/receipts/${testReceiptId}`, superAdmin: 200, admin: 200, staff: 200 },
    { path: '/reports', superAdmin: 200, admin: 200, staff: 200 },
    { path: '/leaderboard', superAdmin: 200, admin: 200, staff: 200 },
    { path: '/attendance', superAdmin: 200, admin: 200, staff: 200 },
    { path: '/profile', superAdmin: 200, admin: 200, staff: 200 },
    { path: '/notifications', superAdmin: 200, admin: 200, staff: 200 },
    { path: '/admin', superAdmin: 200, admin: 200, staff: 404 },
    { path: '/admin/staff', superAdmin: 200, admin: 200, staff: 404 },
    { path: `/admin/staff/${staffUserId}`, superAdmin: 200, admin: 200, staff: 404 },
    { path: '/admin/programs', superAdmin: 200, admin: 200, staff: 404 },
    { path: '/admin/settings', superAdmin: 200, admin: 404, staff: 404 },
    { path: '/admin/attendance', superAdmin: 200, admin: 200, staff: 404 },
  ];

  async function crawlRoutesForUser(
    page: Page,
    role: 'super_admin' | 'admin' | 'staff',
    email: string
  ) {
    // 1. Log in
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((url: URL) => !url.pathname.includes('/login'), {
        timeout: 25000,
        waitUntil: 'domcontentloaded',
      });
    } catch (e) {
      const errText = await page.locator('[role="alert"], .text-red-600, .bg-red-50').allInnerTexts();
      throw new Error(`Login failed for ${email}: ${errText.join(', ')} | error: ${e}`);
    }

    const routes = getRoutes();

    for (const item of routes) {
      const expectedStatus =
        role === 'super_admin' ? item.superAdmin : role === 'admin' ? item.admin : item.staff;

      const consoleErrors: string[] = [];
      const onConsole = (msg: ConsoleMessage) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Filter out benign browser noise if any
          if (!text.includes('favicon.ico') && !text.includes('Download the React DevTools')) {
            // When a route returns 404 by design for unauthorized roles, Chrome logs a 404 resource failure
            if (expectedStatus === 404 && text.includes('404')) {
              return;
            }
            consoleErrors.push(text);
          }
        }
      };
      page.on('console', onConsole);

      const response = await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const status = response ? response.status() : 0;

      // Check for error banners
      let hasErrorBanner = false;
      const errorElements = await page.locator('.bg-red-50, [role="alert"]').allInnerTexts();
      for (const t of errorElements) {
        const lower = t.toLowerCase();
        if (lower.includes('does not exist') || lower.includes('error') || lower.includes('failed')) {
          hasErrorBanner = true;
          break;
        }
      }

      // Check whole body for explicit database/app crash errors
      const bodyText = (await page.locator('body').innerText()).toLowerCase();
      if (bodyText.includes('column "personal_email" does not exist') || bodyText.includes('does not exist')) {
        hasErrorBanner = true;
      }

      const pass =
        status === expectedStatus &&
        !hasErrorBanner &&
        consoleErrors.length === 0;

      crawlResults.push({
        role,
        route: item.path,
        status,
        expectedStatus,
        hasErrorBanner,
        consoleErrors,
        pass,
      });

      page.off('console', onConsole);

      expect(status, `Expected status ${expectedStatus} for ${role} on ${item.path}, got ${status}`).toBe(expectedStatus);
      expect(hasErrorBanner, `Error banner found for ${role} on ${item.path}`).toBe(false);
      expect(consoleErrors, `Console errors found for ${role} on ${item.path}: ${consoleErrors.join('; ')}`).toEqual([]);
    }
  }

  test('Super Admin: visit every route in build list', async ({ page }) => {
    await crawlRoutesForUser(page, 'super_admin', superAdminEmail);
  });

  test('Admin (team): visit every route in build list', async ({ page }) => {
    await crawlRoutesForUser(page, 'admin', adminEmail);
  });

  test('Staff: visit every route in build list', async ({ page }) => {
    await crawlRoutesForUser(page, 'staff', staffEmail);
  });
});
