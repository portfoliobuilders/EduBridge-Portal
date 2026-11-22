# EduBridge Education — Management & Owner Operating Guide
**Receipt, Fee Billing & Candidate Accounting System**

---

## Welcome to EduBridge Receipts

Welcome to the **EduBridge Education Receipt & Billing System**, designed specifically for our Dubai, UAE admissions consultancy operations. This system completely replaces paper receipt books with secure, tamper-proof, gapless digital receipt vouchers and live fee ledgers.

### Key Business Identity
- **Legal Entity**: EduBridge Education
- **UAE Tax Registration Number (TRN)**: `105215478600003`
- **Head Office**: M03, Royal House Building, Hor Al Anz East, Dubai – United Arab Emirates
- **Phone**: +971 58 107 3898 | +971 56 127 3536
- **Email**: `info@edubridgeeducation.com`
- **Web**: `https://edubridgeeducation.com`
- **System Portal**: `https://billing.edubridgeeducation.com`

---

## 1. Access & User Roles

The system enforces strict role-based separation of duties:

| Role | Who It Is For | What They Can Do | Restrictions |
|---|---|---|---|
| **Owner** | Managing Director / General Manager | Full system access: manage staff, set university fee structures, view company financial reports, update company settings, and **void receipts with mandatory reason**. | Can never delete payment history without audit logs. |
| **Staff** | Admissions Counselors & Counselors | Quick-add candidates, enroll students in university programs, record payments, issue receipts, share via WhatsApp/Email, and track their personal collection reports. | Cannot void receipts, cannot edit company settings, cannot access `/admin` or view other staff member's collections unless permitted. |

### Logging In
1. Open your web browser or home screen PWA icon on your mobile phone or computer: `https://billing.edubridgeeducation.com/login`.
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
- **QR Code Verification**: Every PDF and web receipt contains an authentic QR code. Anyone scanning it with a smartphone camera is directed to `https://billing.edubridgeeducation.com/r/<token>` to confirm the voucher's authenticity.

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

## Summary & Support Contacts

For system questions, user credentials, or urgent technical assistance:
- **Managing Director**: EduBridge Education Dubai
- **Technical Support**: `info@edubridgeeducation.com`
- **Application Portal**: `https://billing.edubridgeeducation.com`
