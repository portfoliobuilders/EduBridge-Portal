# EduBridge Portal — Management & Operating Guide
**Admissions, Billing, Workforce & Candidate Accounting System**

---

## Welcome to EduBridge Portal

Welcome to the **EduBridge Portal**, built specifically for our Dubai, UAE admissions consultancy operations. This platform replaces manual record-keeping and paper receipt books with secure, tamper-proof, gapless digital receipt vouchers, live candidate fee ledgers, automated workforce attendance, and real-time team operations.

### Key Business Identity
- **Legal Entity**: EduBridge Education
- **UAE Tax Registration Number (TRN)**: `105215478600003`
- **Head Office**: M03, Royal House Building, Hor Al Anz East, Dubai – United Arab Emirates
- **Phone**: +971 58 107 3898 | +971 56 127 3536
- **Email**: `info@edubridgeeducation.com`
- **Official Website**: `https://edubridgeeducation.com`
- **System Portal**: `https://portal.edubridgeeducation.com`
- **Official Policy**: "Keep your receipt vouchers for future references."

---

## 1. System Roles & Access Hierarchy

The application enforces strict role-based separation of duties across all screens and database queries. There are three core user roles:

| Role | Who It Is For | What They Can Do | What They Cannot Do |
|---|---|---|---|
| **Super Admin** | Managing Director / Executive Leadership | Complete organizational control: manage all staff, create admins, configure company settings, set university fees, approve or void receipts, manage geofences, view company financial reports, and grant temporary support access. | Cannot delete payment records (payments are permanent; voiding preserves audit logs). |
| **Admin** | Team Leaders, Operations Managers, HR, BDMs | Supervise their designated team or company operations: manage counsellor profiles, approve leave and field punches, execute candidate transfers within scope, view team reports, and void receipts (if enabled by Super Admin). | Cannot modify company settings, cannot promote staff to Super Admin, cannot assign developer support flags. |
| **Staff** | Admissions Counsellors & Business Development Executives | Daily admissions and student servicing: register candidates, issue gapless receipt vouchers, share fee statements, verify student documents, request transfers, check in/out within office geofence, and track personal collections. | Cannot access `/admin`, cannot modify fees or masters, cannot view colleagues' candidates (unless exact counter lookup is used), cannot void receipts. |

### Admin Supervision Scope (`admin_scope`)
Administrators are assigned one of two supervision scopes:
1. **Team Scope (`team`)**: The administrator can only view, manage, and supervise counsellors who report to them directly or indirectly through their reporting hierarchy (`reports_to`). Their reports, candidate directory, and attendance matrix are scoped strictly to their team.
2. **Company Scope (`company`)**: The administrator can view and supervise all staff members, candidates, and attendance records across the entire company, but cannot change company settings or appoint Super Admins.

### Job Titles (Labels Only)
Job titles (e.g. *Senior Admissions Counsellor*, *Branch Manager*, *Team Lead*, *HR Executive*, *BDE*) are **display labels only**. They are shown in directory lists, avatars, and email signatures for organizational clarity. A staff member's actual system permissions are governed 100% by their core **Role** (`super_admin`, `admin`, `staff`) and **Admin Scope** (`team`, `company`), not by their job title.

---

## 2. Logging In, Password Reset & Mobile PWA Installation

### Logging In
1. Open your web browser on desktop or mobile: `https://portal.edubridgeeducation.com/login`.
2. Enter your work email address and password.
3. Tap **Sign In**.

### Forgot Password / Reset Password
1. On the login screen, click **Forgot password?**.
2. Enter your registered work email and submit.
3. Check your email for a secure password reset link sent via EduBridge Portal.
4. Click the link to navigate to `https://portal.edubridgeeducation.com/reset-password`, enter your new password, and confirm.

### Installing as a Mobile App (PWA)
EduBridge Portal is designed mobile-first and installs directly onto your phone without requiring an app store:
- **iPhone / iPad (Safari)**:
  1. Open `https://portal.edubridgeeducation.com` in Safari.
  2. Tap the **Share** button (box with an upward arrow) at the bottom.
  3. Scroll down and tap **Add to Home Screen**.
  4. Tap **Add** in the top right. An EduBridge icon will appear on your home screen.
- **Android (Chrome)**:
  1. Open `https://portal.edubridgeeducation.com` in Chrome.
  2. Tap the three-dot menu in the top right corner.
  3. Tap **Install app** or **Add to Home screen**.
  4. Confirm the prompt to place the app on your home screen.

---

## 3. Home Dashboard & Daily Performance Overview

Upon logging in, the home screen provides an immediate snapshot tailored to your permissions:
- **Super Admin & Admin Dashboard**:
  - **KPI Summary**: Total collections this month (AED), new admissions count, total outstanding fees due across candidates, and voided receipt counts.
  - **Payment Mode Breakdown**: Breakdown across Cash, Credit/Debit Card, Payment Link, and Bank Transfer.
  - **Daily Collections Trend**: Graph of daily receipts throughout the selected month.
  - **Top Universities & Courses**: Partner institutions with the highest enrollment volume.
  - **Leaderboard Podium**: Top 3 performing counsellors of the month.
  - **Workforce Attendance Widget**: Real-time count of staff punched in today, late arrivals, field punches awaiting review, and staff on approved leave.
- **Staff Counsellor Dashboard**:
  - Personal month-to-date collection total and admissions count.
  - Quick action buttons: **+ New Receipt**, **+ Add Candidate**, **Punch In/Out**.
  - Personal candidate follow-up list and recent receipts issued.
  - Milestone celebration greetings if a colleague or the counsellor has a birthday or work anniversary.

---

## 4. Candidates: Registration, Ownership & Transfers

In EduBridge Portal, admissions applicants are designated as **Candidates** in all client interfaces.

### Candidate Ownership Structure
Every candidate has two ownership markers:
1. **Primary Candidate Owner (`owner_id`)**: The main counsellor responsible for guiding the student. Set when the candidate is first created.
2. **Admitting Counsellor (`admission_staff_id`)**: Recorded per course enrollment. Sales credit and collection targets belong to the admitting counsellor who closed that enrollment.

### Registering a New Candidate
Staff can register a candidate via two paths:
- **Quick-Add via Record Payment**: While in the payment flow (`/receipts/new`), tap **+ New Candidate**. Enter their full name, mobile number (+971 defaulted), select their university course and agreed tuition fee, and save.
- **Full Candidate Entry**:
  1. Navigate to **Candidates** (`/candidates`).
  2. Tap **+ Add Candidate**.
  3. Fill in candidate details:
     - Full Name, Mobile, WhatsApp, Email.
     - Guardian Details (name, relation, phone).
     - Address (flat/villa, building, street, city, country).
  4. Add their initial course enrollment, intake semester, agreed tuition fee, and any approved scholarship/discount.

### The "Mine" Tag & Candidate Privacy
- **Staff Counsellors**: Can only view candidates where they are the primary candidate owner or admitting counsellor on an enrollment.
- **"Mine" Tag**: On candidate tables, candidates owned directly by the logged-in user display a green **Mine** badge for rapid filtering.
- **Counter Lookup Exception**: If a candidate visits the office to pay an installment when their counsellor is away, any staff member can use the counter lookup on the **Record Payment** screen. Entering the exact mobile number (e.g. `+971501234567`) or candidate code (`EB-STU-00001`) pulls up only the student's name, masked phone number, and outstanding balance. Staff cannot view personal notes, address, or documents. When payment is recorded, sales credit remains with the original counsellor.

### Candidate Transfers (Super Admin & Admin Only)
When a student is reassigned to another counsellor:
1. Open the Candidate Profile (`/candidates/[id]`).
2. Administrators tap **Transfer Candidate**.
3. Select whether to transfer the **Entire Candidate Profile** or a **Specific Enrollment**.
4. Choose the new counsellor from the active staff list.
5. Enter a **Mandatory Explanation Reason** (minimum 5 characters).
6. Tap **Confirm Transfer**.
7. The system notifies the previous counsellor, the new counsellor, and their team leaders. All transfer history is logged permanently in `candidate_transfers`.
*(Note: Staff counsellors cannot transfer directly; they submit a transfer request for admin review).*

---

## 5. UAE VAT Configuration & Tax Treatment

EduBridge Portal is built to comply fully with UAE Federal Tax Authority (FTA) regulations while accommodating non-taxable operations.

### Current Status: VAT is Switched OFF
> **IMPORTANT FOR OPERATIONS**: Company-wide VAT is currently turned **OFF** in system settings (`vat_enabled = false`). All new candidate enrollments automatically default to **No VAT (Non-taxable)**. VAT should remain switched OFF until your certified UAE tax advisor or accountant instructs you to activate it.

### When VAT is Enabled in Settings:
When VAT is activated by Super Admin in **Admin → Settings**, staff select one of three tax treatments when entering a tuition package:

1. **+ VAT on top (Exclusive)**:
   - **How it works**: Base tuition fee is entered. UAE 5% VAT is added on top.
   - **Calculation**: Total Payable = Tuition Fee + (Tuition Fee × 5%).
   - **Example**: Agreement for AED 10,000 → Net Tuition: AED 10,000 | 5% VAT: AED 500 | **Total Payable: AED 10,500.00**.
2. **Includes VAT (Inclusive)**:
   - **How it works**: Package price agreed with candidate already includes 5% VAT.
   - **Calculation**: Taxable Amount = Total Agreed Fee ÷ 1.05; VAT = Total Agreed Fee − Taxable Amount.
   - **Example**: Agreement for AED 10,000 → Taxable: AED 9,523.81 | 5% VAT: AED 476.19 | **Total Payable: AED 10,000.00**.
3. **No VAT (Zero-Rated / Exempt / Out of Scope)**:
   - **How it works**: 0% VAT is charged. A statutory reason must be recorded (e.g. *Zero-rated educational qualification* or *Out of scope*).
   - **Calculation**: Total Payable = Agreed Fee (VAT = AED 0.00).

### Key Accounting Rules:
- **Locked After First Payment**: Once any valid payment receipt is issued for an enrollment, its VAT treatment and fee breakdown are **permanently locked** to prevent financial tampering.
- **Cent-Perfect Rounding Reconciliation**: Each installment computes proportional VAT (`amount × 5 ÷ 105`). When the student settles their final balance, the system automatically adjusts the final voucher's VAT so the sum of all receipt VAT lines matches the total tax liability to the exact cent.
- **Formal Tax Invoices**: When VAT is active, fee statements automatically format as official **Tax Invoices** bearing EduBridge's TRN (`105215478600003`) and sequential numbering.

---

## 6. Recording Payments & Issuing Gapless Receipts

Every receipt voucher issued in EduBridge Portal is assigned a **permanent, sequential, gapless receipt number** (e.g. `EB-RV-2026-00001`, `EB-RV-2026-00002`). Numbers are issued atomically in the database to guarantee no duplicates or missing numbers can ever occur.

### Step-by-Step Payment Process:
1. Tap **+ New Receipt** (or hit shortcut key `N` on desktop, or tap the green floating action button on mobile).
2. Select the candidate and their active enrollment. The ledger displays:
   - Agreed Tuition Fee (Net)
   - VAT Amount (if applicable)
   - Total Fee Payable
   - Total Already Paid to Date
   - **Remaining Balance Due**
3. Enter the **Amount in AED** (cannot exceed the remaining balance).
4. Choose the **Payment Mode**:
   - **Cash**: Cash received at counter.
   - **Card**: Credit or debit card swiped on office POS terminal.
   - **Payment Link**: Online payment link sent to student.
   - **Bank Transfer**: Wire transfer or direct deposit into company bank account.
5. Select **Payment Purpose** (*Admission Deposit*, *Tuition Installment*, or *Other*).
6. Optional: Enter notes or transaction references in **Comments**.
7. Tap **Confirm & Record Payment**.

---

## 7. Sharing Receipt Vouchers

Once a payment is recorded, the official receipt voucher is displayed immediately:

- **WhatsApp (1-Click Share)**: Tap **Share via WhatsApp** to open a friendly, pre-written WhatsApp message containing the student's name, voucher number, amount paid, and live verification link.
- **Email Branded PDF**: Tap **Email Receipt**. The system sends a professional email to the candidate's registered address with the official PDF attached.
- **Download High-Res PDF**: Tap **Download PDF** to save or print the official letterhead document with Poppins typography, company seal, TRN, and QR code.
- **Live QR Verification**: Every receipt voucher features a secure QR code. Scanning it with any mobile phone opens `https://portal.edubridgeeducation.com/r/<token>` to verify voucher authenticity.
- **Link Privacy Controls**: Super Admins and the counsellor who received the payment can rotate the public share token or disable public link access at any time from the receipt details screen.

---

## 8. Voiding Receipts & Financial Governance

To maintain accounting integrity, **payments cannot be deleted or edited**. If a payment was recorded in error (e.g. incorrect amount or wrong payment mode):

1. **Authorization**: Only **Super Admins** can void receipts by default. An **Admin** may only void receipts if the Super Admin has explicitly enabled the **"Allow Admins to Void Receipts"** toggle in Company Settings. Staff can never void receipts.
2. **Procedure**:
   - Open the receipt voucher (`/receipts/[id]`).
   - Click the red **Void Receipt** button.
   - Enter a **Mandatory Explanation Reason** (minimum 5 characters, e.g. *"Duplicate POS swipe — customer paid by cash instead"*).
   - Tap **Confirm Void**.
3. **Audit Trail**: The receipt is permanently watermarked with **VOID**, the date and author of the void are recorded, and the candidate's ledger balance automatically restores the unpaid amount.

---

## 9. Fee Statements & Candidate Ledgers

A candidate's entire financial ledger can be reviewed or shared as a unified statement:
1. Open the Candidate Profile (`/candidates/[id]`).
2. Tap the **Fee Statement** tab.
3. Review the live statement:
   - Course, university, and intake details.
   - Itemized history of all payments, dates, receipt numbers, and payment modes.
   - Net fee, VAT breakdown, total paid, and remaining balance due.
4. Tap **Download Statement PDF** or **Share Statement Link** (`/r/statement/<token>`) to send the student their full financial history.

---

## 10. Candidate Documents, Self-Upload Links & Verification

EduBridge Portal provides a paperless document repository for student admission records.

### Document Types
- 10th Certificate / Mark Sheet
- 12th Certificate / Mark Sheet
- Degree Certificate (Bachelor / Master)
- Degree Marksheet / Consolidated Transcript
- ID Proof (Masked Aadhaar or Passport)
- Passport-Size Photo
- Other Supporting Documents (SOP, CV, Experience Letter)

### Automated Image Compression & PDF Rules
- **Images**: Automatically compressed in the browser before upload (max 1600px width, JPEG format, target size under 500 KB; photos under 200 KB). EXIF and GPS location data are automatically stripped on the server for student privacy.
- **PDFs**: Maximum file size is 2 MB per document. If a candidate attempts to upload an oversized file, a helpful prompt recommends compressing it.
- **iPhone HEIC Files**: Automatically converted to standard JPEG in the browser so counsellors can open them instantly.

### Requesting Documents via Self-Upload Link
1. Open Candidate Profile (`/candidates/[id]`) and click the **Documents** tab.
2. Tap **Request Documents**.
3. Check the document slots required.
4. Choose link expiry: **3 days**, **7 days** (default), or **14 days**.
5. Tap **Share via WhatsApp** or **Copy Link**.
6. **Student Privacy**: When the candidate opens their link (`https://portal.edubridgeeducation.com/u/<token>`), they see only their first name and the upload slots. They cannot see fees, receipts, notes, or files uploaded by staff.

### Verification Workflow
1. When documents are uploaded, the counsellor and administrator receive an in-app notification.
2. Tap any document card to open the previewer:
   - **Rotate & Zoom**: Inspect stamps, marks, and signatures clearly.
   - **Verify**: Marks document as verified with the staff member's name and Dubai timestamp.
   - **Reject**: Requires a mandatory explanation reason (e.g. *"Document image is blurry — please re-upload clear scan"*).
   - **Archive**: Safely archives duplicate or replaced files without deleting audit history.
   - **Download All (ZIP)**: Downloads all verified candidate files in a single archive named `<candidate_code>_<name>_documents.zip`.

---

## 11. Reports, Day-End Cash Balancing & Accounting CSV Export

At the end of each working day, managers and counsellors balance their cash and reconcile transactions:

1. Navigate to **Reports** (`/reports`).
2. Select the date range (e.g. **Today**, **This Week**, or **This Month** in Dubai time).
3. **Reconcile Collections by Mode**:
   - Total **Cash** collected in the office drawer.
   - Total **Card** swiped on POS machines.
   - Total **Bank Transfers** and **Payment Links**.
4. **Staff Breakdown**: Filter by counsellor to review individual intake numbers and collections.
5. **Download CSV**: Click **Export CSV** to generate a clean spreadsheet formatted for accounting reconciliation and external audits.

---

## 12. Staff Management & Team Structure (Admin Console)

Accessible by Super Admins and Admins at `/admin/staff`.

### Adding a New Staff Member:
1. Navigate to **Admin → Staff**.
2. Tap **+ Add Staff Member**.
3. Fill in their details:
   - Full Name, Work Email, Mobile Phone.
   - **Role**: Assign `staff` or `admin`. (Only Super Admins can appoint Admins or Super Admins).
   - **Reports To**: Select their team leader or manager.
   - **Admin Scope**: If appointing an Admin, choose `team` or `company`.
   - **Job Title**: Select or type their display job title.
   - **Attendance Settings**: Assign their primary office, shift start/end times (default 09:00–18:00), grace period (15 mins), and field punch permission.
4. The staff member receives an invitation email to set their login password.

### Staff Deactivation:
When an employee leaves the consultancy:
1. Open their staff profile in **Admin → Staff**.
2. Toggle their status to **Inactive**.
3. The staff member is immediately prevented from signing in. All historical receipts, admissions, attendance punches, and audit logs remain intact.

---

## 13. Attendance, Geofencing, Field Punches & Workforce Tracking

EduBridge Portal features a server-verified attendance engine operating in Dubai local time (`Asia/Dubai`).

### One-Tap Geofenced Check-In/Out
- Accessible directly on the **Home Dashboard** or the **Attendance** page (`/attendance`).
- **How Geofencing Works**:
  - When staff tap **Punch In** or **Punch Out**, the browser requests current GPS coordinates.
  - The server verifies their distance from their assigned office using the high-accuracy Haversine formula.
  - Staff must be within their office radius (typically 100 meters, with a 50m accuracy padding buffer for indoor GPS drift).
  - If staff are outside the geofence, the punch is rejected with an exact distance (e.g. *"You are 320m from Royal House Building Office. Please move within 100m"*).
- **Location Privacy Guarantee**: Location is sampled **only** at the instant the staff member taps Punch In or Punch Out. The app **never** tracks location in the background.

### Field Punches for Business Development Managers
- Staff with `allow_field_punch = true` (e.g. BDMs visiting universities or schools) can check in outside the office geofence.
- A **Mandatory Field Note** (minimum 5 characters, e.g. *"Meeting with Admissions Dean at Heriot-Watt University"*) is required.
- Field punches are flagged as `pending_approval` until an Administrator reviews and approves them in the **Admin Attendance Console**.

### Automated Daily Attendance Routines:
- **Auto-Close Unclosed Sessions (23:59 Asia/Dubai)**: If an employee forgets to punch out, the system closes their day at 23:59 with a status of `missing_checkout`. Worked hours remain **0.00** until the employee submits a regularization request with their true departure time and a manager approves it.
- **Auto-Absence Detection (06:00 Asia/Dubai)**: Every morning at 06:00, the system scans the previous working day. Any staff member required to attend who has no accepted punch and no approved leave is marked `absent`, and notifications are sent to the staff member and their manager.

---

## 14. Leave Management, Holidays & Punch Regularization

### Submitting a Leave Request
1. Navigate to **Attendance** (`/attendance`) and tap **Request Leave**.
2. Select Leave Type (*Annual Leave*, *Casual Leave*, *Sick Leave*, *Unpaid Leave*).
3. Set Start Date, End Date, and Full-Day vs Half-Day flag.
4. Enter a reason and submit.
5. The team leader receives an in-app notification. When approved, all dates in the range are automatically marked as `on_leave` in the monthly matrix.

### Punch Regularization (Corrections)
If a staff member experienced a phone battery failure, network issue, or forgot to punch out:
1. Go to **Attendance → My Attendance**.
2. Tap **Request Regularization** next to the affected day.
3. Enter requested check-in and check-out times, explain the reason, and submit.
4. When approved by an Admin, the system recalculates total worked minutes, updates the record to `regularized = true`, and logs the approval in `audit_log`.

### Company Holidays
Configured in **Admin → Attendance → Holidays**:
- Super Admins and Admins can add official UAE Public Holidays (e.g. *Eid Al Fitr*, *National Day*, *New Year's Day*).
- Holidays can apply to all offices or specific branches.
- Employees are exempt from attendance on designated holidays without triggering absence warnings.

---

## 15. Staff Leaderboard & AED Visibility

Accessible at `/leaderboard` to foster transparent, healthy motivation across the admissions team:
- **Podium & Rankings**: Ranks counsellors based on admissions closed and fees collected across **This Week**, **This Month**, or **This Quarter**.
- **Ties**: Broken automatically by the earliest timestamp of achievement.
- **Team Filter**: Administrators can filter the leaderboard to view rankings within their specific team.
- **AED Visibility Toggle (`show_aed_to_staff`)**:
  - In **Admin → Settings**, Super Admins control the **"Show AED Amounts to Staff"** setting.
  - When **OFF** (default): Staff counsellors see admissions counts and ranks only; currency amounts are hidden and return as blank/null.
  - When **ON**: Staff see both admission counts and total AED collected.
  - Administrators and Super Admins always see full AED amounts regardless of this toggle.

---

## 16. Team Milestone Celebrations (Birthdays & Anniversaries)

The portal automatically recognizes employee milestones in Dubai local time:
- **Privacy First (Zero Age Leakage)**: The system **never** discloses an employee's birth date, birth year, or age to colleagues or in notifications. Only their name and milestone occasion are recognized.
- **Leap Year Safe**: Staff born on February 29 are celebrated on February 28 during non-leap years.
- **Celebrant Experience**: On their milestone day, the celebrant receives a greeting banner, avatar indicator, and an interactive **Wishes Wall**.
- **Wishes Wall & Thank Everyone**: Colleagues can post warm wishes (up to 280 characters). The celebrant can tap **"Thank Everyone"** to send an automatic thank-you notification to all well-wishers.
- **Opt-Out Control**: Any staff member who prefers privacy can turn off celebrations anytime in **My Profile** (`/profile`) by disabling **Celebrate Birthday** or **Celebrate Work Anniversary**.
- **Celebration Emails Toggle**: Super Admins can enable or disable automated celebratory staff emails in **Admin → Settings**.

---

## 17. In-App Notifications & Realtime Alerts

Located in the top header bell and on `/notifications`:
- **Real-Time Notification Delivery**: Powered by Supabase Realtime; notifications appear instantly without refreshing your browser.
- **Standard Events**:
  - Payment recorded for your candidate.
  - New enrollment created.
  - Receipt voucher voided.
  - Candidate uploaded documents via self-upload link.
  - Candidate transferred to/from your account.
  - Leave or regularization request submitted/approved/rejected.
  - Colleague milestone celebration today.
- **Safety**: Notification links are restricted to internal application routes (`/candidates/...`, `/attendance`, etc.) to prevent malicious redirects.

---

## 18. Personal Profiles & Confidential Details Privacy

### Staff Self-Service (`/profile`)
Staff members can manage their everyday profile:
- Upload profile photo (square-cropped, compressed automatically).
- Update display name, contact phone number, and residential address.
- Toggle milestone celebration opt-outs.

### Confidential Personal Details (`staff_sensitive_details`)
- Highly sensitive employee data (Date of Birth, home residential address, and emergency contact details) are stored in an isolated, encrypted database table protected by PostgreSQL Row-Level Security.
- **Peers cannot view these fields under any circumstances**.
- Only authorized administrators within the employee's supervisory scope can access emergency contacts and personal details.
- Corporate fields (Job title, Employee ID, Joining Date, Work Email, Role, Reporting Manager) are **admin-locked** and can only be altered by an Administrator.

---

## 19. Company Settings, Security & Developer Support Access

Located at `/admin/settings` (Super Admin Only).

### Key Settings:
- **Company Branding & Letterhead**: Legal business name, TRN, office address, phone numbers, official support email, and high-resolution logo upload.
- **Receipt Prefix & Sequential Numbers**: Default receipt number prefix (e.g. `EB-RV-2026-`).
- **VAT Registration Toggle**: Enable or disable company-wide VAT calculation.
- **Allow Admins to Void Receipts**: Grants or restricts receipt voiding privileges for team leaders.
- **Show AED Amounts to Staff**: Controls whether counsellors see currency amounts on the leaderboard.
- **Staff Celebration Emails**: Toggles whether milestone announcement emails are delivered to staff inboxes.

### Developer Support Access (`support_access_enabled`)
For technical troubleshooting and system maintenance, designated engineering support accounts exist with an `is_support` flag.
- **Complete Super Admin Control**: Support accounts are **locked out by default**. When the Super Admin toggles **"Support Access"** to **OFF** in Settings, support accounts are immediately rejected by database security policies and cannot view or query any candidate, receipt, or attendance data.
- **Temporary Access**: If technical assistance is required, the Super Admin switches the toggle **ON**. Once support is finished, the Super Admin turns the toggle back **OFF** to restore complete lock-out.

---

## 20. "What to do if…" Operations FAQ

### 1. What if a candidate pays via Bank Transfer and the funds haven't reflected yet?
> **Answer**: Do not issue a receipt until funds are confirmed in the bank account. Once finance verifies the credit, open **Record Payment**, select **Bank Transfer**, enter the bank reference in Comments, and issue the voucher.

### 2. What if a counsellor entered the wrong payment amount or selected the wrong course?
> **Answer**: Payments cannot be edited. A Super Admin (or Admin if enabled) must open the receipt (`/receipts/[id]`), click **Void Receipt**, and enter the reason. The balance will be restored, and the counsellor can immediately issue a fresh, correct receipt voucher.

### 3. What if a candidate's tuition fee was agreed at AED 15,000, but they were granted an approved discount?
> **Answer**: Open the candidate's profile, click on their enrollment, and adjust the fee breakdown. Enter the base fee (AED 15,000) and discount amount. The net payable balance updates automatically. Note: This can only be done before any payments are recorded; once a payment is made, the fee structure locks.

### 4. What if a staff member cannot check in because GPS says they are outside the office?
> **Answer**: Ensure location permissions are set to "Allow While Using App" with "Precise Location" enabled on iOS/Android. If they are indoors and GPS drifts beyond the geofence radius, they should connect to the office Wi-Fi network (if network matching is enabled) or move closer to an exterior window and try again.

### 5. What if an employee forgot to punch out before going home?
> **Answer**: The system will close their day at 23:59 as a "Missing Checkout". The employee should open `/attendance`, locate the day, tap **Request Regularization**, enter their true departure time (e.g. 18:00) with a brief explanation, and submit. Once their manager approves it, their hours are restored.

### 6. What if a counsellor is on leave and another staff member needs to collect an installment?
> **Answer**: The covering staff member goes to **Record Payment** and uses the **Counter Lookup** field. Entering the candidate's full mobile number pulls up their payment ledger without giving access to their private documents or counsellor notes. The covering staff member records the payment, and sales credit stays with the absent counsellor.

---

## Summary & Official Contact Directory

For administrative inquiries, system access requests, or urgent technical assistance:
- **Managing Director & Operations**: EduBridge Education Dubai
- **Administrative Headquarters**: M03, Royal House Building, Hor Al Anz East, Dubai – UAE
- **Official Inquiries**: `info@edubridgeeducation.com`
- **Application Portal**: `https://portal.edubridgeeducation.com`
