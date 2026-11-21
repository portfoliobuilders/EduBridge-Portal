# EduBridge Receipt & Billing App — Project Rules

## Who this is for
EduBridge Education (Dubai, UAE) is an admissions consultancy. Staff admit students to partner
universities/courses, collect fees in instalments, and issue receipt vouchers. This app replaces
their paper receipt book.

## Business identity (letterhead on every PDF)
- Name: EduBridge Education
- Address: M03, Royal House Building, Hor Al Anz East, Dubai – UAE
- Mobile: +971 58 107 3898   (CONFIRM: the business card says +971 56 127 3536 — owner decides which
  goes on receipts; it is editable in Settings either way)
- Email: info@edubridgeeducation.com
- Website: https://edubridgeeducation.com
- TRN: 105215478600003
- Footer line: "Keep your receipt vouchers for future references."

## Brand (from the official EduBridge brand kit — use exactly)
- Colours (only these three + neutrals derived from them):
  - Primary green  #00A57E  (RGB 0,165,126)
  - Black          #000000  (use #0A0A0A for large text blocks if pure black feels harsh)
  - White          #FFFFFF
  - Derived tints for UI only: green-50 #E6F6F2, green-100 #CCEDE5, green-700 #00805F (hover/pressed),
    neutrals #F5F6F6 (page bg), #E4E7E7 (borders), #6B7272 (muted text).
  - Status colours (not in brand, keep muted): amber #B7791F for "balance due", red #C53030 ONLY for void/destructive.
- Fonts:
  - UI + body + PDFs: Poppins (Regular 400, Medium 500, SemiBold 600). Load with next/font/google.
  - Display headings (page titles, dashboard KPI numbers): Clash Grotesk (from Fontshare). If the
    licence/self-hosting is a problem, fall back to Poppins SemiBold — never a third font.
  - All money/number columns: font-variant-numeric: tabular-nums.
- Logo files are already in the repo under public/brand/ — NEVER redraw or recreate the logo:
  - edubridge-logo-color.svg   → black "Edu" + green "Bridge" — use on white (app header, PDFs, login)
  - edubridge-logo-on-dark.svg → white "Edu" + green "Bridge" — use on black backgrounds
  - edubridge-logo-white.svg   → all white — use on the green #00A57E background
  - edubridge-logo-black.svg   → all black — use for single-colour print / fax-style output
  - PNG versions (1200px wide, transparent) with the same names for places SVG can't be used.
- Brand feel (from the brand presentation): solid flat green surfaces, generous white space,
  bold clean wordmark, no gradients, no glassmorphism, no illustrations. Rounded corners 12–16px.
All of these live in a `company_settings` table and are editable by the owner. Never hard-code
them in components.

## Stack (do not substitute)
- Next.js 15+ App Router, TypeScript strict, Server Components + Server Actions
- Tailwind CSS + shadcn/ui, lucide-react icons
- Supabase: Postgres, Auth (email + password), Storage, RLS. Use `@supabase/ssr`.
- Zod for every input, react-hook-form on forms
- PDF: `@react-pdf/renderer`, rendered server-side in a Node.js route handler
- Email: Resend (with PDF attachment)
- Phone numbers: `libphonenumber-js`, stored in E.164 (default country AE)
- Dates: store `timestamptz` UTC; display in `Asia/Dubai` using `date-fns-tz`
- Money: `numeric(12,2)` in DB; never use JS floats for arithmetic — compute totals in SQL
- Deploy: Vercel

## Environment variables
NEXT_PUBLIC_SUPABASE_URL=https://bhbgkhyewxaacqnjltwr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   (safe in browser)
SUPABASE_SECRET_KEY=sb_secret_...                          (SERVER ONLY — never import in client code)
RESEND_API_KEY=...
EMAIL_FROM="EduBridge Education <receipts@edubridgeeducation.com>"
NEXT_PUBLIC_APP_URL=https://<vercel-domain>
Never commit .env*. Keep .env.example updated with names only.

## Credentials
- Never set, reset, invent, print or log any user's password.
- Never search transcripts, logs or files for passwords/tokens.
- Never INSERT/UPDATE rows in the auth schema directly — users are created only via supabase.auth.admin APIs or the Dashboard.
- Never write "Output:" for a command you did not run. Browser checks you can't run → "PENDING — user to verify".
- Never set/print passwords or tokens. Never use auth.admin.generateLink / magic links / service-role sessions to log in as a real user. For screenshots, create disposable test users via auth.admin.createUser with emails ending @test.edubridge.local, sign in as them with a password held only in a process env var (never written to files or output), and delete them afterwards.
- Never edit a pushed migration.

## Roles
- owner: everything — masters, staff management, settings, all reports, void receipts.
- staff: create/search students, create enrollments, record payments, send receipts,
  see their own collection report. Cannot void, cannot change settings/masters, cannot delete.
Enforce roles in Postgres RLS AND in server actions. UI hiding alone is not security.

## Non-negotiable data rules
1. Payments (receipts) are immutable. No UPDATE/DELETE from the app. Only owner may void via RPC
   with a mandatory reason. Voided receipts stay visible, watermarked "VOID".
2. Payments are created ONLY through the `record_payment` Postgres function (atomic: locks the
   enrollment, checks balance, issues gapless receipt number, stores snapshots).
3. Balance = total_fee − discount − sum(valid payments). Computed in SQL (view), never in the client.
4. No hard deletes anywhere. Masters and students use `is_active` / archive.
5. Every write records `created_by` (auth.uid()). Server sets timestamps, not the client.
6. All money displayed as "AED 12,500.00".
7. Never edit a migration after it has been pushed — always add a new one with the next sequence number.

## Code conventions
- `src/app/(auth)`, `src/app/(app)` for the signed-in shell, `src/app/r/[token]` for public receipts.
- `src/lib/supabase/{server,client,admin}.ts`; `admin.ts` (secret key) only imported by server files.
- Database types generated with `supabase gen types typescript --linked > src/types/database.ts`.
- All schema changes as migrations in `supabase/migrations/`. Never edit the DB by hand in the dashboard. Never edit a migration after it has been pushed — always add a new one.
- Mobile-first: staff mostly use phones. Every screen must work at 375px width, tap targets ≥44px.
- Reference repos (InvoiceShelf, Invoice Ninja, InvoicePlane, Accountill, invoiso, Kill Bill,
  Meteroid) are for UX/domain patterns ONLY. Do not copy their code (licensing differs).

## Working style
- Before coding, state the plan in ≤10 bullets. After coding, list files changed and how to test.
- Run `npm run build` and `npm run lint` before declaring done. Fix all type errors.
- If a requirement is ambiguous, ask ONE question rather than guessing on money/permissions logic.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
