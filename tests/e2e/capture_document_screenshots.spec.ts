import { test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import crypto from 'crypto';
import { createTestCandidateWithEnrollment, deleteTestCandidate } from '../helpers/test-candidate';

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

test.describe('Capture Candidate Document Screenshots', () => {
  const runId = Date.now();
  const testEmail = `pw_doc_screen_${runId}@test.edubridge.local`;
  const password = `DocScreenPass_${runId}#123!`;
  let testUserId: string;
  let testStudentId: string;
  let activeToken: string;
  let expiredToken: string;

  test.beforeAll(async () => {
    // 1. Create owner user
    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: 'Screenshot Tester' },
    });
    if (userErr || !userData.user) throw userErr || new Error('User creation failed');
    testUserId = userData.user.id;

    await supabase
      .from('profiles')
      .update({ role: 'owner', is_active: true, full_name: 'Screenshot Tester' })
      .eq('id', testUserId);

    // 2. Create test candidate through atomic RPC
    const candidate = await createTestCandidateWithEnrollment(supabase, {
      fullName: 'Fatima Al Mansoori',
      mobile: `+97158${runId.toString().slice(-7)}`,
      staffUserId: testUserId,
    });
    testStudentId = candidate.studentId;

    // Get 10th and 12th certificate types
    const { data: docTypes } = await supabase
      .from('document_types')
      .select('id, slug')
      .in('slug', ['10th-certificate', '12th-certificate', 'id-proof-aadhaar-passport']);

    const typeIds = (docTypes || []).map((t) => t.id);
    const doc10th = (docTypes || []).find((t) => t.slug === '10th-certificate');

    // Insert a sample document so viewer can be shown
    if (doc10th) {
      await supabase.from('candidate_documents').insert({
        student_id: testStudentId,
        document_type_id: doc10th.id,
        title: '10th Secondary School Certificate',
        file_path: `EB-DOC-SCR-${runId.toString().slice(-4)}_fatima/10th-certificate/sample.jpg`,
        file_name: '10th_certificate.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 420000,
        original_size_bytes: 1800000,
        status: 'received',
        uploaded_via: 'candidate_link',
      });
    }

    // 3. Create active upload link
    activeToken = crypto.randomBytes(32).toString('hex');
    await supabase.from('document_upload_links').insert({
      student_id: testStudentId,
      token: activeToken,
      requested_types: typeIds,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: testUserId,
    });

    // 4. Create expired upload link
    expiredToken = crypto.randomBytes(32).toString('hex');
    await supabase.from('document_upload_links').insert({
      student_id: testStudentId,
      token: expiredToken,
      requested_types: typeIds,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      created_by: testUserId,
    });
  });

  test.afterAll(async () => {
    if (testStudentId) {
      await supabase.from('document_upload_links').delete().eq('student_id', testStudentId);
      await supabase.from('candidate_documents').delete().eq('student_id', testStudentId);
      await supabase.from('students').delete().eq('id', testStudentId);
    }
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  test('Capture Document Screenshots across 1280px Desktop and 375px Mobile', async ({ page }) => {
    // A. Login
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // B. Candidate Profile -> Documents Tab
    await page.goto(`/candidates/${testStudentId}`);
    await page.waitForLoadState('networkidle');

    // Click "Documents" tab
    await page.getByRole('button', { name: /Documents/i }).first().click();
    await page.waitForTimeout(600);

    // 1. Documents Tab 1280px
    await page.screenshot({
      path: 'docs/screenshots/candidate_documents_tab_1280.png',
      fullPage: false,
    });

    // 2. Documents Tab 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'docs/screenshots/candidate_documents_tab_375.png',
      fullPage: false,
    });

    // 3. Request Documents Dialog 375px
    await page.getByRole('button', { name: /Request documents/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'docs/screenshots/request_documents_dialog_375.png',
      fullPage: false,
    });

    // 4. Request Documents Dialog 1280px
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'docs/screenshots/request_documents_dialog_1280.png',
      fullPage: false,
    });

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // 5. Public candidate self-upload page (/u/[token]) Desktop 1280px
    await page.goto(`/u/${activeToken}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: 'docs/screenshots/public_self_upload_1280.png',
      fullPage: false,
    });

    // 6. Public candidate self-upload page (/u/[token]) Mobile 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'docs/screenshots/public_self_upload_375.png',
      fullPage: false,
    });

    // 7. Expired upload link Mobile 375px
    await page.goto(`/u/${expiredToken}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: 'docs/screenshots/public_expired_link_375.png',
      fullPage: false,
    });
  });

  test.afterAll(async () => {
    if (testStudentId) {
      await deleteTestCandidate(supabase, testStudentId);
    }
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });
});
