import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || '';

const adminClient = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe('Candidate Documents & Self-Upload Link Flow', () => {
  const runId = Date.now();
  const staffEmail = `doc_staff_${runId}@test.edubridge.local`;
  const tempPassword = `DocP@ss_${runId}!Aa1`;

  let staffUserId: string;
  let testStudentId: string;
  let activeToken: string;
  let expiredToken: string;

  test.beforeAll(async () => {
    // 1. Create disposable staff user
    const { data: staffData, error: staffErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: `Doc Staff ${runId}` },
    });
    if (staffErr || !staffData.user) {
      throw new Error(`Failed to create staff user: ${staffErr?.message}`);
    }
    staffUserId = staffData.user.id;

    await adminClient
      .from('profiles')
      .update({ role: 'staff', is_active: true, full_name: `Doc Staff ${runId}` })
      .eq('id', staffUserId);

    // 2. Create test candidate
    const { data: studentData, error: studentErr } = await adminClient
      .from('students')
      .insert({
        student_code: `EB-DOC-${runId.toString().slice(-5)}`,
        full_name: 'Fatima Al Mansoori',
        mobile: '+971581073898',
        created_by: staffUserId,
      })
      .select('id')
      .single();

    if (studentErr || !studentData) {
      throw new Error(`Failed to create test candidate: ${studentErr?.message}`);
    }
    testStudentId = studentData.id;

    // Get 10th and 12th certificate types
    const { data: docTypes } = await adminClient
      .from('document_types')
      .select('id')
      .in('slug', ['10th-certificate', '12th-certificate']);

    const typeIds = (docTypes || []).map((t) => t.id);

    // 3. Create active upload link (64-character hex token)
    activeToken = crypto.randomBytes(32).toString('hex');
    await adminClient.from('document_upload_links').insert({
      student_id: testStudentId,
      token: activeToken,
      requested_types: typeIds,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: staffUserId,
    });

    // 4. Create expired upload link (64-character hex token)
    expiredToken = crypto.randomBytes(32).toString('hex');
    await adminClient.from('document_upload_links').insert({
      student_id: testStudentId,
      token: expiredToken,
      requested_types: typeIds,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      created_by: staffUserId,
    });
  });

  test.afterAll(async () => {
    // Clean up
    if (testStudentId) {
      await adminClient.from('document_upload_links').delete().eq('student_id', testStudentId);
      await adminClient.from('candidate_documents').delete().eq('student_id', testStudentId);
      await adminClient.from('students').delete().eq('id', testStudentId);
    }
    if (staffUserId) {
      await adminClient.auth.admin.deleteUser(staffUserId);
    }
  });

  test('Public self-upload page (/u/[token]) displays candidate first name and requested types only', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // Mobile viewport
    await page.goto(`/u/${activeToken}`);

    // Candidate FIRST NAME only (Fatima), never full name or sensitive financial details
    await expect(page.locator('h1')).toContainText('Fatima');
    await expect(page.getByText('Al Mansoori')).not.toBeVisible();

    // Check branding
    await expect(page.getByAltText('EduBridge Education').first()).toBeVisible();

    // Check camera & gallery buttons exist
    await expect(page.getByRole('button', { name: /Take photo/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /gallery/i }).first()).toBeVisible();

    // Check requested document types are displayed
    await expect(page.getByText('10th certificate')).toBeVisible();
  });

  test('Expired/revoked link displays friendly 404 page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/u/${expiredToken}`);

    // Check friendly 404 UI
    await expect(page.getByText('Upload Link Expired or Unavailable')).toBeVisible();
    await expect(
      page.getByText(/This document upload link has expired or has been revoked/i)
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact EduBridge' })).toBeVisible();
  });

  test('ZIP download endpoint rejects unauthenticated request with 401', async ({ request }) => {
    const res = await request.get(`/api/candidates/${testStudentId}/documents/zip`);
    expect(res.status()).toBe(401);
  });
});
