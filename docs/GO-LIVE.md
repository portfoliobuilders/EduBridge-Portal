# EduBridge Portal — Go-Live Checklist

This checklist must be executed in sequence before turning over the live application to staff and candidate-facing operations.

---

## Pre-Launch Verification Checklist

### 1. Environment & Infrastructure
- [ ] **Vercel Production Deployment**: Build succeeds with 0 errors across all routes.
- [ ] **Custom Domain Active**: `https://portal.edubridgeeducation.com` resolves with valid HTTPS SSL certificate.
- [ ] **Security Headers Verified**:
  - `Content-Security-Policy` active
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] **Supabase URL Configuration**: `https://portal.edubridgeeducation.com` configured as default Site URL.
- [ ] **Resend Transactional Email Active**: Domain DKIM and SPF records verified.

---

### 2. Database & Data Sanitation
- [ ] **Remote Migrations Verified**:
  ```bash
  npx supabase migration list --remote
  ```
  Ensure all migrations (0001 through 0047) are applied and in sync.
- [ ] **Advisors Security & Performance Audit**:
  ```bash
  npx supabase db advisors --remote
  ```
  Ensure 0 duplicate indexes and 0 auth_rls_initplan warnings.
- [ ] **Clean Up Test & Demo Data**:
  Execute `supabase/scripts/cleanup_test_data.sql` to purge all temporary candidates, enrollments, payments, and audit logs used during test verification. This includes removing the 7 legacy test candidates with `EB-DOC-*` codes (`fa35fc91-36d5-40eb-b257-5c683ed40a4a`, `7c86db38-b93e-4b0a-80e8-95c210027631`, `a75c0756-728a-4f26-826a-5cccf9c29154`, `7159888d-36f4-4556-a9aa-a3d40ff3b84a`, `ac5ecced-4318-41b5-927d-8612347926d8`, `7f8d656b-cf6e-4a37-ad56-c76405e1998b`, `8992df4a-93ff-4aed-9337-07769ff6e4f0`).
- [ ] **Validate Student Code CHECK Constraint**:
  After running `cleanup_test_data.sql`, validate the candidate code constraint in Postgres:
  ```sql
  ALTER TABLE public.students VALIDATE CONSTRAINT students_student_code_format_check;
  ```
- [ ] **Create Active Candidate Unique Index**:
  After cleanup removes existing duplicate candidate test rows, execute:
  ```sql
  CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_students_active_mobile_name
  ON public.students (mobile, lower(trim(full_name)))
  WHERE is_active = true;
  ```
- [ ] **Initialize Sequence Counters**:
  Ensure the `counters` table has the starting values:
  - `student_code_counter`: 0 (or company starting number)
  - `receipt_voucher_2026`: 0 (first receipt will be `EB-RV-2026-00001`)

---

### 3. Master Data Verification
- [ ] **Company Settings**:
  - TRN: `105215478600003`
  - Address: `M03, Royal House Building, Hor Al Anz East, Dubai – UAE`
  - Phone: `+971 58 107 3898`
  - Email: `info@edubridgeeducation.com`
  - Website: `https://edubridgeeducation.com`
- [ ] **Partner Universities & Courses**:
  - Review active universities and degree courses in `/admin/programs`.
  - Confirm default fee structures and currencies.
- [ ] **Staff Accounts**:
  - Invite official admissions counselors and staff members via `/admin/staff`.
  - Ensure roles are assigned appropriately (`owner` vs `staff`).

---

### 4. End-to-End Operational Smoke Test
- [ ] Staff signs in at `https://portal.edubridgeeducation.com/login`.
- [ ] Staff quick-adds a real or pilot candidate and creates enrollment.
- [ ] Staff records a payment (Card, Cash, or Link).
- [ ] Receipt voucher generates with gapless number `EB-RV-2026-XXXXX`.
- [ ] QR code on the receipt scans directly to public receipt page `https://portal.edubridgeeducation.com/r/<token>`.
- [ ] Download official PDF and confirm EduBridge brand letterhead, Poppins typography, and UAE TRN number.
- [ ] WhatsApp receipt link delivers correct candidate prefilled message.
- [ ] Email receipt delivery confirmed via Resend.

---

### 5. Final Handover
- [ ] Disposable test accounts (@test.edubridge.local) deleted from Supabase Auth.
- [ ] Provide EduBridge Managing Director with `docs/OWNER-GUIDE.md` and `docs/OWNER-GUIDE.pdf`.
- [ ] Owner changes temporary credentials to strong, private production password.
