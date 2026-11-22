# EduBridge Portal — Management & Owner Operating Guide
**Admissions, Billing & Candidate Accounting System**

---

## Welcome to EduBridge Portal

Welcome to the **EduBridge Portal**, designed specifically for our Dubai, UAE admissions consultancy operations. This system completely replaces paper receipt books with secure, tamper-proof, gapless digital receipt vouchers, live fee ledgers, and staff performance workflows.

### Key Business Identity
- **Legal Entity**: EduBridge Education
- **UAE Tax Registration Number (TRN)**: `105215478600003`
- **Head Office**: M03, Royal House Building, Hor Al Anz East, Dubai – United Arab Emirates
- **Phone**: +971 58 107 3898 | +971 56 127 3536
- **Email**: `info@edubridgeeducation.com`
- **Web**: `https://edubridgeeducation.com`
- **System Portal**: `https://portal.edubridgeeducation.com`

---

## 1. Access & User Roles

The system enforces strict role-based separation of duties:

| Role | Who It Is For | What They Can Do | Restrictions |
|---|---|---|---|
| **Owner** | Managing Director / General Manager | Full system access: manage staff, set university fee structures, view company financial reports, update company settings, and **void receipts with mandatory reason**. | Can never delete payment history without audit logs. |
| **Staff** | Admissions Counselors & Counselors | Quick-add candidates, enroll students in university programs, record payments, issue receipts, share via WhatsApp/Email, and track their personal collection reports. | Cannot void receipts, cannot edit company settings, cannot access `/admin` or view other staff member's collections unless permitted. |

### Logging In
1. Open your web browser or home screen PWA icon on your mobile phone or computer: `https://portal.edubridgeeducation.com/login`.
2. Enter your authorized email address and password.
3. Tap **Sign In**.

---

## 2. Managing Admissions Staff (Owner Only)

To add new counselors or manage existing staff:
1. Tap **Admin** in the navigation bar (or mobile Account sheet).
2. Select **Staff Management** (`/admin/staff`).
3. Tap **+ Add Staff Member**.
4. Enter their full name, email, and assign their role (`staff` or `owner`).
5. The counselor will receive an invitation email to set their private password.
6. **Deactivating Staff**: If a counselor leaves the organization, toggle their status to **Inactive**. Their past receipts and admissions remain intact in all audit logs, but they can no longer log in.

---

## 3. Universities & Programmes Catalog (Owner Only)

Ensure your partner universities and program fees are up-to-date:
1. Navigate to **Admin → Programmes Catalog** (`/admin/programs`).
2. **Add University**: Enter university name (e.g. *Heriot-Watt University Dubai*), country, and campus.
3. **Add Degree Course**: Select the university, degree level (Undergraduate, Postgraduate, Diploma), course name, and default fee.
4. **Specializations**: Optionally attach specializations or majors with specific tuition fee amounts.

---

## 4. Registering a Candidate (Candidate Profiles)

Staff can register candidates in two ways:

### Option A: Quick-Add directly while recording a payment
When a candidate is standing at your desk or paying online:
1. Open **Record Payment** (`/receipts/new`).
2. Tap the green **+ New Candidate** button.
3. Enter their **Full Name** and **Mobile Number** (defaulted to UAE `+971`).
4. Tap **Next: Program & Fee**.
5. Select their partner university, degree program, and agreed tuition fee.
6. Tap **Create Candidate & Enrollment** — the system instantly links the candidate and opens the payment form!

### Option B: From the Candidates Screen
1. Tap **Candidates** in the navigation.
2. Tap **+ Add Candidate**.
3. Fill in candidate details:
   - Full Name, Mobile, WhatsApp, Email.
   - Guardian Details (Father/Mother/Guardian name, contact phone).
   - Billing & Mailing Address.
4. Set university program, intake semester, agreed tuition fee, and any approved scholarship/discount.

---

## 4.1 VAT Treatment & Fee Calculation ("With Tax / Without Tax")

EduBridge provides Swipe-style, clear tax treatment for all candidate enrollments and payment vouchers under UAE Federal Tax Authority (FTA) regulations.

### Which VAT Option to Choose
*(Important: Confirm with your certified UAE accountant/tax advisor before choosing)*

When setting up or adjusting a candidate's tuition package, staff select one of three treatments using the segmented tax control:

1. **+ VAT on top (Exclusive)**:
   - **How it works**: The fee entered is the base tuition before tax. VAT (standard UAE 5.00%) is added on top.
   - **Financial Formula**: Total Payable = Net Tuition + 5% VAT.
   - **Example**: Agreement for AED 10,000 → Net: AED 10,000.00 | Taxable: AED 10,000.00 | VAT 5%: AED 500.00 | **Total Payable: AED 10,500.00**.
   - **When to choose**: When your consultancy quotation or university agreement states that UAE VAT will be billed additionally.

2. **Includes VAT (Inclusive)**:
   - **How it works**: The agreed total fee already includes 5% VAT.
   - **Financial Formula**: Total Payable = Agreed Fee; Taxable = Total Payable / 1.05; VAT = Total Payable − Taxable.
   - **Example**: Agreement for AED 10,000 → Taxable: AED 9,523.81 | VAT 5%: AED 476.19 | **Total Payable: AED 10,000.00**.
   - **When to choose**: When an all-inclusive package price was promised to the candidate.

3. **No VAT (Zero-Rated / Exempt / Out of Scope)**:
   - **How it works**: 0% VAT is charged. A statutory FTA reason must be selected:
     - **Zero-rated (0%)**: Qualifying educational services or exported international services.
     - **Exempt**: Specific financial or residential services exempt under UAE law.
     - **Out of scope**: Activities outside the territorial scope of UAE VAT law.
   - **Example**: Agreement for AED 10,000 → Taxable: AED 10,000.00 | VAT: AED 0.00 | **Total Payable: AED 10,000.00**.
   - **When to choose**: When the service qualifies for zero-rating or exemption as confirmed by your accountant.

### Key VAT Operating Rules:
- **Locked After First Payment**: To maintain complete accounting integrity, once any valid receipt is recorded on an enrollment, its VAT treatment and tax rate are permanently locked and cannot be edited.
- **Tax Invoices**: When VAT is active and treatment is not "No VAT", fee statements automatically generate as formal **TAX INVOICES** featuring EduBridge's TRN (`105215478600003`), itemized taxable breakdown, tax rates, and sequential invoice numbers.
- **Cent-Perfect Rounding Reconciliation**: Each payment computes proportional VAT (`amount × 5 / 105`). When a candidate makes their final payment to settle their balance to zero, the system automatically adjusts the final voucher's VAT so the sum of all receipt VAT lines equals the total tax liability to the exact cent.
- **Company Settings Note**: Changing default VAT treatment in Settings only applies to new candidates created afterwards; existing enrollments always keep their agreed snapshot.

---

## 5. Recording Payments & Issuing Receipts

Every payment recorded in the application generates a **permanent, gapless sequential receipt number** (e.g., `EB-RV-2026-00001`, `EB-RV-2026-00002`).

### Step-by-Step Payment Process:
1. Navigate to **Record Payment** (or press the green `+` FAB button on mobile, or hit shortcut key `N` on desktop).
2. Select the candidate / enrollment. The live balance card shows the exact fee breakdown, total paid to date, and remaining balance due.
3. Enter the **Amount in AED** (cannot exceed the remaining balance).
4. Choose the **Payment Mode**:
   - **Card**: Tap Card. No card approval code required.
   - **Cash**: Select Cash. Handled at the counter.
   - **Payment Link**: Tap Payment Link.
   - **Bank Transfer**: Tap Bank Transfer.
   - *Optional*: Enter details (e.g. bank transfer reference or notes) in the **Comments** field.
5. Select **Payment Purpose** (*Admission Deposit*, *Tuition Installment*, or *Other*).
6. Verify the **Payee Name** (defaulted to candidate name).
7. Tap **Confirm & Record Payment**.

---

## 6. Sharing Receipts with Candidates

Once recorded, the official receipt voucher is displayed immediately:

- **WhatsApp (1-Click)**: Tap the **WhatsApp** button to open a pre-formatted friendly message with candidate name, receipt voucher number, amount paid, and live verification link.
- **Email PDF**: Tap **Email Receipt**. Resend delivers an email directly to the candidate with the branded PDF attached.
- **Download PDF**: Tap **Download PDF** to save or print the official letterhead receipt formatted in high-resolution Poppins typography with UAE TRN.
- **QR Code Verification**: Every PDF and web receipt contains an authentic QR code. Anyone scanning it with a smartphone camera is directed to `https://portal.edubridgeeducation.com/r/<token>` to confirm the voucher's authenticity.

---

## 7. Voiding a Receipt (Owner Only Control)

Payments in EduBridge cannot be deleted or overwritten. If an error occurred (e.g. wrong amount entered):

1. Only an **Owner** account can void a receipt.
2. Open the receipt voucher (`/receipts/[id]`).
3. Tap the red **Void Receipt** button in the top action bar.
4. Enter a **Mandatory Explanation Reason** (minimum 5 characters, e.g., *"Duplicate swipe on POS terminal — refunded on card"*).
5. Tap **Confirm Void**.
6. The receipt is permanently watermarked with **VOID**, and the candidate's ledger balance automatically restores the fee balance.

---

## 8. Fee Statements & Candidate Ledgers

To share an entire fee statement showing all installments, balance, and university details:
1. Open the Candidate's profile (`/candidates/[id]`).
2. Tap the **Fee Statement** tab.
3. Tap **Share Statement Link** or **Download Statement PDF**.
4. The candidate can view their live balance anytime without logging in via their private secure token.

---

## 9. Day-End Cash Balancing & Reports

At the end of each working day:
1. Navigate to **Reports** (`/reports`).
2. Select the date range (e.g. **Today** in `Asia/Dubai` time).
3. Review total collections grouped by payment method:
   - Total **Cash** in counter
   - Total **Card** transactions
   - Total **Bank Transfers** & **Payment Links**
4. Filter by counselor to reconcile individual staff collections.
5. Tap **Export CSV** to download a spreadsheet for EduBridge accounting and external audit.

---

## 10. Offline Handling & PWA

- **Installed App**: You can install EduBridge Receipts on iOS and Android devices by tapping "Add to Home Screen" in Safari / Chrome.
- **Offline Protection**: If internet connection drops, the system displays an amber top warning: *"You're offline. Payment recording and receipts require an active internet connection."* Payments are never queued offline, guaranteeing that duplicate or corrupted receipt numbers can never occur.

---

## 11. Candidate Document Management & Self-Upload Links

Candidates can submit their admission documents directly, or staff can upload them on their behalf. Nothing is mandatory.

### Predefined Document Types
- **10th certificate**: Secondary school certificate / mark sheet.
- **12th certificate**: Higher secondary certificate / mark sheet.
- **Degree certificate**: Bachelor / Master degree certificate.
- **Degree marksheet / transcript**: Consolidated mark sheet or official semester transcripts.
- **ID proof (Aadhaar or Passport)**: User selects which one to upload. For Aadhaar, instructions clearly inform the candidate to upload the **Masked Aadhaar** (only last 4 digits visible) from mAadhaar or UIDAI.
- **Passport-size photo**: Recent photo on white background.
- **Other**: Free title for additional documents (experience letter, SOP, CV).

### Automatic Image Compression & PDF Limits
- **Images**: Automatically compressed in the browser before upload (max 1600px, quality ~0.7, target ≤ 500 KB; photos ≤ 200 KB). EXIF and GPS location data are automatically stripped on the server for student privacy.
- **PDFs**: Hard limit of 2 MB per PDF. If a candidate attempts to upload an oversized PDF, a friendly guide message advises them to compress it (e.g. using `ilovepdf.com/compress_pdf`) or scan at lower resolution.
- **HEIC / HEIF (iPhones)**: Automatically converted to JPEG in the browser so counselors and university partners can always open them on any device.

### Requesting Documents from Candidates (Self-Upload Link)
1. Open the Candidate's profile (`/candidates/[id]`) and click the **Documents** tab.
2. Tap **Request Documents**.
3. Select which document types are required.
4. Set link expiry duration (**3 days**, **7 days** (default), or **14 days**).
5. Share via **WhatsApp** (pre-populated with candidate name, link, and expiry), **SMS**, **Email**, or tap **Copy link**.
6. **Privacy Guarantee**: The candidate public page (`/u/[token]`) displays the candidate's **first name only** (e.g., *Fatima*) and requested document slots. It is strictly upload-only and **never** reveals fees, receipts, existing files, or other private data.

### Verification & Review Workflow
1. When a document is received, counselors see an **Unverified** badge on the candidate profile and dashboard widget.
2. Tap any document card to open the **Document Viewer**:
   - **Zoom & Rotate**: Inspect seals, marks, and signatures clearly.
   - **Verify**: Marks the document as verified with counselor name and Dubai timestamp.
   - **Reject**: Requires a mandatory explanation reason (e.g. *"Photo is blurred / please re-upload"*).
   - **Archive**: Safely archives outdated or duplicate files without hard-deleting records.
   - **Download All (ZIP)**: Generates a single organized archive named `<student_code>_<name>_documents.zip`.

---

---

## 12. Staff Profiles & Confidential Details Management

Counselors and administrators can manage their personal profiles, while administrators configure official corporate credentials.

### Counselor Self-Service (`/profile`)
- **Profile Photo**: Counselors can upload a professional headshot (compressed automatically, ≤ 1 MB, square-cropped). Stored in a private, encrypted storage bucket.
- **Personal Details**: Display name, phone, personal email, date of birth, residential address, and emergency contact details.
- **Admin-Locked Fields**: Corporate attributes such as **Job Title**, **Employee ID**, **Joining Date**, and **Work Email** are strictly locked for staff and can only be set or edited by an Administrator or Owner.
- **Privacy Enforcement**: Highly sensitive personal data (Date of Birth year, residential address, and emergency contact information) are isolated in a dedicated table (`staff_sensitive_details`) protected by PostgreSQL Row-Level Security. Peers cannot view sensitive personal details.
- **Celebration Opt-Outs**: Staff can independently toggle whether they wish to celebrate their birthday or work anniversary.

### Admin Staff Management (`/admin/staff/[id]`)
- Administrators can click any staff member in the staff directory to access their administrative profile.
- Edit official **Job Title**, unique **Employee ID**, **Joining Date**, system **Role**, and reporting hierarchy.
- Confidential details (DOB, address, emergency contact) are visible only to authorized administrators within the staff member's administrative scope.

---

## 13. Milestone Celebrations (Birthdays & Work Anniversaries)

The system automatically recognizes team member milestones in Dubai local time (Asia/Dubai) with a warm, professional celebration experience.

### Daily Processing & Privacy Standards
- **Automated Daily Engine**: Runs at 08:30 Asia/Dubai daily. Recognizes birthdays and work anniversaries (1+ years of service).
- **Leap Year Safe**: In non-leap years, staff born on February 29 have their celebration automatically recognized on February 28.
- **Zero Birth-Year Leakage**: The system **never** reveals a team member's birth year, birth date, or age to colleagues or in notifications. Only their first name and milestone occasion are shared.
- **Email Notification Control**: The Owner can toggle **Staff Celebration Emails** on or off in **Company Settings → Security**. When enabled, staff receive branded celebratory emails via Resend. In-app notifications remain active regardless.

### Celebrant Experience
- On their celebration day, the celebrant enjoys:
  - A celebratory gradient top strip across the app shell (birthday soft gold or anniversary trophy gold).
  - A dashboard hero banner on Home: *"Happy Birthday, [Name]! 🎂"* or *"Happy [N]-Year Work Anniversary, [Name]! 🎉"*.
  - A brief, graceful confetti burst on initial daily login (respects `prefers-reduced-motion`).
  - An interactive **Wishes Wall** displaying warm wishes from colleagues with avatars and timestamps.
  - A one-click **"Thank everyone"** button that posts a thank-you notification to all well-wishers.
  - A subtle milestone badge (🎂 or 🏆) on their avatar across the app.

### Colleague & Team Experience
- Colleagues see a slim, dismissible notification banner under the header: *"🎂 It's [Name]'s birthday today — send your wishes"*.
- Tap **"Wish [Name]"** to open the celebration modal, write a personal note (up to 280 characters), and use quick-insert emojis.
- Tap **"Dismiss"** to hide the banner for the remainder of the day (stored locally).
- Financial, receipting, PDF, and candidate-facing screens are **strictly un-themed** to preserve business focus.

---

## 14. In-App Notifications & Live Realtime Updates

Stay informed of key operational and team events with the header notification bell:
- **Header Notification Bell**: Displayed in the desktop sidebar and mobile top bar with a live unread count badge.
- **Automated Event Notifications**:
  - **Payment Recorded**: Automatically notifies the candidate's primary counselor, their administrative supervisor, and owners.
  - **New Enrollment / Sale**: Dispatched to supervisors and owners.
  - **Receipt Voided**: Alerts the admissions counselor and administrative team immediately.
  - **Candidate Self-Uploaded Documents**: Alerts the counselor as soon as a candidate submits files via their link.
  - **Candidate Transfers**: Notifies the previous counselor, new counselor, and administrative supervisors.
  - **Staff Celebrations**: Reminder notifications for colleague birthdays and work anniversaries.
- **Interactive Panel & Page**: Grouped by **Today** and **Earlier**. Tap any notification to mark it read and navigate directly to the relevant record. Filter notifications by category on `/notifications`.
- **Live Realtime Updates**: Powered by Supabase Realtime for instant notification delivery without page refresh.

---

## 15. Candidate Ownership & Counselor Transfers

Ensure clear accountability and seamless counselor transitions:
- **Primary Counselor Ownership**: Every candidate has a designated primary counselor (`students.owner_id`), while individual program enrollments track their admitting counselor (`admission_staff_id`).
- **Visibility Boundaries**:
  - Staff counselors list and view only their own assigned candidates.
  - Administrators view candidates assigned to staff in their supervision scope.
  - Super Admins and Owners view all candidates across the organization.
- **Counter Lookup Exception**: Staff can quickly process a payment for a colleague's candidate using the **Record Payment** counter lookup. Requires an exact mobile number or candidate code match. Access is minimal and read-only, sales credit remains with the assigned counselor, and every lookup is logged in the audit trail.
- **Candidate Transfers**: Administrators can transfer candidate ownership or enrollment credit with a mandatory explanation reason (`transfer_candidate` RPC). Every transfer is permanently logged in `candidate_transfers` and visible on the candidate activity timeline.

---

## Summary & Support Contacts

For system questions, user credentials, or urgent technical assistance:
- **Managing Director**: EduBridge Education Dubai
- **Technical Support**: `info@edubridgeeducation.com`
- **Application Portal**: `https://portal.edubridgeeducation.com`
