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

  test('5 MB JPG upload on /u/[token] compresses to <= 500 KB in storage with zero CSP errors', async ({
    page,
  }) => {
    // 1. Generate genuine 5+ MB JPG buffer
    const sharp = (await import('sharp')).default;
    const w = 3800;
    const h = 2800;
    const rawBuffer = Buffer.alloc(w * h * 3);
    for (let i = 0; i < rawBuffer.length; i += 3) {
      rawBuffer[i] = i % 255;
      rawBuffer[i + 1] = Math.floor(i / 3) % 255;
      rawBuffer[i + 2] = 200;
    }
    const bigJpgBuffer = await sharp(rawBuffer, {
      raw: { width: w, height: h, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    expect(bigJpgBuffer.length).toBeGreaterThan(5 * 1024 * 1024);

    // 2. Track CSP violations and console errors
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, text);
      if (
        /violates the following Content Security Policy/i.test(text) ||
        /Content Security Policy/i.test(text)
      ) {
        cspViolations.push(text);
      }
    });
    page.on('pageerror', (err) => {
      console.log('[BROWSER UNCAUGHT ERROR]:', err);
    });

    // 3. Navigate to /u/[token]
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/u/${activeToken}`);
    await expect(page.locator('h1')).toContainText('Fatima');

    // 4. Attach the 5 MB JPG to the first file input
    const fileInput = page.locator('input[type="file"]').first();

    const uploadResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/public/uploads/${activeToken}`) && resp.status() === 200,
      { timeout: 45000 }
    );

    await fileInput.setInputFiles({
      name: 'large_highres_document.jpg',
      mimeType: 'image/jpeg',
      buffer: bigJpgBuffer,
    });

    // 5. Wait for the upload network response
    const uploadResponse = await uploadResponsePromise;
    const json = await uploadResponse.json();
    expect(json.document).toBeDefined();

    // 6. Verify in storage & DB: ends up <= 500 KB
    const { data: docRecord, error: docErr } = await adminClient
      .from('candidate_documents')
      .select('*')
      .eq('id', json.document.id)
      .single();

    expect(docErr).toBeNull();
    expect(docRecord).toBeDefined();
    expect(docRecord.size_bytes).toBeLessThanOrEqual(500 * 1024);

    // Also download from Supabase storage to verify raw stored payload
    const { data: fileBlob, error: downloadErr } = await adminClient.storage
      .from('candidate-documents')
      .download(docRecord.file_path);

    expect(downloadErr).toBeNull();
    const arrayBuf = await fileBlob!.arrayBuffer();
    expect(arrayBuf.byteLength).toBeLessThanOrEqual(500 * 1024);

    console.log(
      `PROOF: 5.7 MB JPG (${bigJpgBuffer.length} bytes) compressed to ${docRecord.size_bytes} bytes in DB, and ${arrayBuf.byteLength} bytes in Supabase storage.`
    );

    // 7. Assert zero CSP violations
    expect(cspViolations).toEqual([]);
  });

  test('ZIP download endpoint rejects unauthenticated request with 401', async ({ request }) => {
    const res = await request.get(`/api/candidates/${testStudentId}/documents/zip`);
    expect(res.status()).toBe(401);
  });
});
