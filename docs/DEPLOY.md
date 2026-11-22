# EduBridge Receipt & Billing Application — Production Deployment Guide

This guide describes the complete, reproducible process for deploying the EduBridge Receipt & Billing application to Vercel connected to the production Supabase PostgreSQL backend, Hostinger DNS, and Resend transactional email service.

---

## 1. Prerequisites & Stack Summary

- **Framework**: Next.js 15+ App Router, TypeScript strict, Server Actions
- **Database & Auth**: Supabase (Hosted PostgreSQL with Row-Level Security)
- **Domain**: `billing.edubridgeeducation.com` (DNS managed via Hostinger)
- **Transactional Email**: Resend (`receipts@edubridgeeducation.com`)
- **Hosting Platform**: Vercel (Edge Network + Serverless Node.js runtime)

---

## 2. Environment Variables Configuration

Set the following variables in the **Vercel Project Settings → Environment Variables** (configured for **Production** and **Preview**):

| Variable Name | Environment | Description | Example / Reference |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production & Preview | Supabase project API gateway URL | `https://bhbgkhyewxaacqnjltwr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production & Preview | Supabase public anon API key (browser safe) | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | Production Only | Supabase Service Role Secret Key (**SERVER ONLY** - never expose client-side) | `sb_secret_...` |
| `RESEND_API_KEY` | Production Only | API key from Resend dashboard for sending transactional receipts | `re_...` |
| `EMAIL_FROM` | Production & Preview | Verified sender name & email address | `EduBridge Education <receipts@edubridgeeducation.com>` |
| `NEXT_PUBLIC_APP_URL` | Production | Canonical public URL used in QR codes, public links, and emails | `https://billing.edubridgeeducation.com` |

> [!CAUTION]
> Ensure `SUPABASE_SECRET_KEY` and `RESEND_API_KEY` are unflagged for client-side access. They are strictly imported into server modules guarded by `import 'server-only'`.

---

## 3. Vercel Project Setup Steps

1. **Import Git Repository**:
   - In Vercel, click **Add New… → Project**.
   - Select the `Edubridge-Invoice-app` GitHub repository.

2. **Build and Output Settings**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install --legacy-peer-deps`

3. **Node.js Version**:
   - In **Project Settings → General → Node.js Version**, select **20.x** or **22.x**.

4. **Add Environment Variables**:
   - Paste the 6 environment variables listed in Section 2.
   - Click **Deploy**.

---

## 4. Custom Domain Setup (Hostinger DNS)

EduBridge's primary website runs on `edubridgeeducation.com`. The billing app is hosted at the subdomain `billing.edubridgeeducation.com`.

1. **In Vercel Dashboard**:
   - Go to **Project Settings → Domains**.
   - Enter `billing.edubridgeeducation.com` and click **Add**.
   - Vercel displays the required DNS target: `cname.vercel-dns.com`.

2. **In Hostinger DNS Management**:
   - Log in to Hostinger hPanel → Domains → `edubridgeeducation.com` → **DNS / Nameservers**.
   - Add a new DNS Record:
     - **Type**: `CNAME`
     - **Name / Subdomain**: `billing`
     - **Target / Value**: `cname.vercel-dns.com`
     - **TTL**: `300` (or `Automatic`)
   - Click **Add Record**.

3. **Verify SSL & Propagation**:
   - Back in Vercel, the status will turn to **Valid Configuration** within 2–10 minutes.
   - Vercel automatically provisions and renews a Let's Encrypt SSL/TLS certificate.

---

## 5. Supabase Production URL Configuration

To ensure secure authentication redirects and password reset flows:

1. In Supabase Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `https://billing.edubridgeeducation.com`
   - **Redirect URLs**:
     - `https://billing.edubridgeeducation.com/**`
     - `https://billing.edubridgeeducation.com/auth/callback`
     - `https://billing.edubridgeeducation.com/reset-password`
     - `http://localhost:3000/**` (for local development)

2. Under **Authentication → Email Templates**:
   - Confirm Invite and Reset Password templates reference `{{ .SiteURL }}`.

---

## 6. Resend Domain Verification (Email Delivery)

Receipts and statements are sent via Resend:

1. In **Resend Dashboard → Domains → Add Domain**:
   - Add `edubridgeeducation.com` (or dedicated subdomain `mail.edubridgeeducation.com`).
2. Add the generated DNS records into **Hostinger DNS**:
   - **DKIM** (TXT / CNAME records)
   - **SPF** (`v=spf1 include:amazonses.com ~all` or Resend value)
   - **DMARC** (`v=DMARC1; p=none; rua=mailto:...`)
3. Verify status in Resend shows **Verified**.

---

## 7. Rollback & Disaster Recovery Procedures

### Application Rollback (Instant)
If a regressions occurs after a frontend deployment:
1. Open Vercel Dashboard → **Deployments**.
2. Locate the previous stable deployment.
3. Click the three dots `...` → **Instant Rollback**.
4. Traffic is routed immediately to the previous build without rebuild time.

### Database Migration Safety
- All database modifications are executed via sequential migrations (`supabase/migrations/`).
- **Policy**: Never edit pushed migrations. All database hotfixes must be introduced as new numbered forward migrations (e.g. `0017_...sql`).
- All financial payment records and receipt numbers are gapless and immutable. Voiding is done exclusively through `void_payment` RPC with mandatory reason preservation.
