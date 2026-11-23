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

test.describe('Attendance Geofencing, Punch Flow & Admin Console E2E', () => {
  const runId = Date.now();
  const staffEmail = `att_staff_${runId}@test.edubridge.local`;
  const adminEmail = `att_admin_${runId}@test.edubridge.local`;
  const staffPass = `StaffPass_${runId}!Aa1`;
  const adminPass = `AdminPass_${runId}!Aa1`;

  let staffId: string;
  let adminId: string;
  let officeId: string;

  test.beforeAll(async () => {
    // 1. Ensure test office exists (Dubai Royal House)
    const { data: office, error: offErr } = await adminClient
      .from('offices')
      .upsert({
        name: `Test Dubai Head Office ${runId}`,
        address: 'M03, Royal House Building, Hor Al Anz East, Dubai',
        latitude: 25.276987,
        longitude: 55.334587,
        radius_m: 100,
        allowed_public_ips: ['203.0.113.195'],
        require_network_match: false,
        is_active: true,
      })
      .select()
      .single();
    if (offErr || !office) throw offErr || new Error('Office setup failed');
    officeId = office.id;

    // 2. Create Staff User
    const { data: staffData, error: staffErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password: staffPass,
      email_confirm: true,
      user_metadata: { full_name: `Joe Attendance ${runId}` },
    });
    if (staffErr || !staffData.user) throw staffErr || new Error('Staff creation failed');
    staffId = staffData.user.id;

    await adminClient
      .from('profiles')
      .update({
        full_name: `Joe Attendance ${runId}`,
        role: 'staff',
        job_title: 'Education Consultant',
        is_active: true,
      })
      .eq('id', staffId);

    // Assign office and attendance settings to staff
    await adminClient
      .from('staff_attendance_settings')
      .upsert({
        user_id: staffId,
        office_id: officeId,
        shift_start: '09:00:00',
        shift_end: '18:00:00',
        grace_minutes: 15,
        weekly_off: [0],
        attendance_required: true,
        allow_field_punch: true, // Enable field punch for testing flow
        require_network_match: false,
      });

    // 3. Create Admin User
    const { data: adminData, error: adminErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
      user_metadata: { full_name: `Admin Attendance ${runId}` },
    });
    if (adminErr || !adminData.user) throw adminErr || new Error('Admin creation failed');
    adminId = adminData.user.id;

    await adminClient
      .from('profiles')
      .update({
        full_name: `Admin Attendance ${runId}`,
        role: 'super_admin',
        job_title: 'Operations Director',
        is_active: true,
      })
      .eq('id', adminId);
  });

  test.afterAll(async () => {
    if (staffId) {
      await adminClient.rpc('cleanup_test_attendance_user', { p_user_id: staffId });
      await adminClient.auth.admin.deleteUser(staffId);
    }
    if (adminId) {
      await adminClient.auth.admin.deleteUser(adminId);
    }
    if (officeId) {
      await adminClient.from('offices').delete().eq('id', officeId);
    }
  });

  test('1. Geofenced Punch Inside -> Success, Timer Active & Screenshot', async ({ page, context }) => {
    // Grant location permission and mock GPS coordinates inside office geofence
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({
      latitude: 25.276987,
      longitude: 55.334587,
      accuracy: 10,
    });

    // Set viewport to desktop 1280
    await page.setViewportSize({ width: 1280, height: 800 });

    // Sign in as staff
    await page.goto('/login');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', staffPass);
    await page.click('button[type="submit"]');

    // Wait for Dashboard
    await page.waitForURL('/');
    await expect(page.locator('h3:has-text("Today\'s Attendance")')).toBeVisible({ timeout: 15000 });

    // Accept privacy notice if prompted
    const punchButton = page.locator('button:has-text("Punch In")');
    await expect(punchButton).toBeVisible();

    await punchButton.click();

    // If privacy modal appears, accept it
    const modalConfirm = page.locator('button:has-text("I Understand & Continue")');
    if (await modalConfirm.isVisible({ timeout: 2000 })) {
      await modalConfirm.click();
    }

    // Wait for status update: "Punched In"
    await expect(page.locator('button:has-text("Punch Out")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('span:has-text("Punched In")')).toBeVisible();

    // Capture desktop Home Punch Card screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/attendance_punch_in_desktop_1280.png',
      fullPage: false,
    });

    // Capture mobile 375 Home Punch Card screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/e2e/screenshots/attendance_punch_in_mobile_375.png',
      fullPage: false,
    });

    // Punch out
    await page.setViewportSize({ width: 1280, height: 800 });
    const punchOutBtn = page.locator('button:has-text("Punch Out")');
    await punchOutBtn.click();
    await expect(page.locator('button:has-text("Punch In")')).toBeVisible({ timeout: 15000 });

    // Capture desktop Home Punch Out screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/attendance_punch_out_desktop_1280.png',
      fullPage: false,
    });

    // Now test outside geofence error: disable allow_field_punch
    await adminClient
      .from('staff_attendance_settings')
      .update({ allow_field_punch: false })
      .eq('user_id', staffId);

    await page.reload();
    await expect(page.locator('button:has-text("Punch In")')).toBeVisible({ timeout: 15000 });

    // Mock GPS outside geofence (Abu Dhabi ~130km away)
    await context.setGeolocation({
      latitude: 24.453884,
      longitude: 54.377344,
      accuracy: 15,
    });

    // Attempt to punch in outside geofence
    await page.locator('button:has-text("Punch In")').click();

    // Verify rejection error message with distance
    await expect(page.locator('p:has-text("m from the office")')).toBeVisible({ timeout: 15000 });

    // Capture error screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/attendance_punch_error_desktop_1280.png',
      fullPage: false,
    });
  });

  test('2. /attendance Self-Service Calendar & Monthly Log View', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Sign in as staff
    await page.goto('/login');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', staffPass);
    await page.click('button[type="submit"]');

    await page.waitForURL('/');

    // Navigate to /attendance
    await page.goto('/attendance');
    await expect(page.locator('h1:has-text("My Attendance & Leave")')).toBeVisible({ timeout: 15000 });

    // Verify metric cards visible
    await expect(page.locator('span:has-text("Total Worked")')).toBeVisible();
    await expect(page.locator('span:has-text("Days Present")')).toBeVisible();

    // Capture /attendance Calendar screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/attendance_calendar_desktop_1280.png',
      fullPage: false,
    });

    // Mobile viewport screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/e2e/screenshots/attendance_calendar_mobile_375.png',
      fullPage: false,
    });
  });

  test('3. Admin Console: Today Board, Team Monthly Sheet & Office Map Settings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Sign in as Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', adminPass);
    await page.click('button[type="submit"]');

    await page.waitForURL('/');

    // Navigate to /admin/attendance
    await page.goto('/admin/attendance');
    await expect(page.locator('h1:has-text("Attendance & Workforce Console")')).toBeVisible({ timeout: 15000 });

    // Today Board
    await expect(page.locator('span:has-text("Punched In")').first()).toBeVisible();
    await page.screenshot({
      path: 'tests/e2e/screenshots/admin_attendance_today_board_1280.png',
      fullPage: false,
    });

    // Switch to Team Monthly Sheet Tab
    await page.click('button:has-text("Team Monthly Sheet")');
    await expect(page.locator('h2:has-text("Team Monthly Attendance Matrix")')).toBeVisible();
    await page.screenshot({
      path: 'tests/e2e/screenshots/admin_attendance_monthly_sheet_1280.png',
      fullPage: false,
    });

    // Switch to Offices Tab
    await page.click('button:has-text("Offices & Geofencing")');
    await expect(page.locator('h2:has-text("Offices & Geofenced Locations")')).toBeVisible();

    // Click Edit Geofence to open Leaflet map
    await page.locator('button:has-text("Edit Geofence & Map")').first().click();
    await expect(page.locator('h2:has-text("Edit Office Geofence")')).toBeVisible();
    await expect(page.locator('button:has-text("Use my current location")')).toBeVisible();

    // Wait for leaflet tiles / map canvas to render
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'tests/e2e/screenshots/admin_office_map_dialog_1280.png',
      fullPage: false,
    });
  });

  test.afterAll(async () => {
    if (staffId) {
      await adminClient.from('attendance_punches').delete().eq('user_id', staffId);
      await adminClient.from('attendance_daily_summary').delete().eq('user_id', staffId);
      await adminClient.from('leave_requests').delete().eq('user_id', staffId);
      await adminClient.from('staff_attendance_settings').delete().eq('user_id', staffId);
      await adminClient.from('profiles').delete().eq('id', staffId);
      await adminClient.auth.admin.deleteUser(staffId);
    }
    if (adminId) {
      await adminClient.from('profiles').delete().eq('id', adminId);
      await adminClient.auth.admin.deleteUser(adminId);
    }
    if (officeId) {
      await adminClient.from('offices').delete().eq('id', officeId);
    }
  });
});
