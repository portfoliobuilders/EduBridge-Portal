# EduBridge Receipt & Billing Application — Go-Live Checklist

This checklist must be executed in sequence before turning over the live application to staff and candidate-facing operations.

---

## Pre-Launch Verification Checklist

### 1. Environment & Infrastructure
- [ ] **Vercel Production Deployment**: Build succeeds with 0 errors across all routes.
- [ ] **Custom Domain Active**: `https://billing.edubridgeeducation.com` resolves with valid HTTPS SSL certificate.
- [ ] **Security Headers Verified**:
  - `Content-Security-Policy` active
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] **Supabase URL Configuration**: `https://billing.edubridgeeducation.com` configured as default Site URL.
- [ ] **Resend Transactional Email Active**: Domain DKIM and SPF records verified.

---

### 2. Database & Data Sanitation
- [ ] **Remote Migrations Verified**:
  ```bash
  npx supabase migration list --remote
  ```
  Ensure all migrations (0001 through 0016) are applied and in sync.
- [ ] **Advisors Security & Performance Audit**:
  ```bash
  npx supabase db advisors --remote
  ```
  Ensure 0 duplicate indexes and 0 auth_rls_initplan warnings.
- [ ] **Clean Up Test & Demo Data**:
  Execute `scripts/cleanup_test_data.sql` to purge all temporary candidates, enrollments, payments, and audit logs used during test verification.
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
- [ ] Staff signs in at `https://billing.edubridgeeducation.com/login`.
- [ ] Staff quick-adds a real or pilot candidate and creates enrollment.
- [ ] Staff records a payment (Card, Cash, or Link).
- [ ] Receipt voucher generates with gapless number `EB-RV-2026-XXXXX`.
- [ ] QR code on the receipt scans directly to public receipt page `https://billing.edubridgeeducation.com/r/<token>`.
- [ ] Download official PDF and confirm EduBridge brand letterhead, Poppins typography, and UAE TRN number.
- [ ] WhatsApp receipt link delivers correct candidate prefilled message.
- [ ] Email receipt delivery confirmed via Resend.

---

### 5. Final Handover
- [ ] Disposable test accounts (@test.edubridge.local) deleted from Supabase Auth.
- [ ] Provide EduBridge Managing Director with `docs/OWNER-GUIDE.md` and `docs/OWNER-GUIDE.pdf`.
- [ ] Owner changes temporary credentials to strong, private production password.
