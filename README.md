# EduBridge Receipt & Billing App

Admissions consultancy receipt and billing management web application for EduBridge Education (Dubai, UAE).

## Tech Stack
- **Framework:** Next.js 15+ App Router, TypeScript strict, Server Components & Server Actions
- **Database & Auth:** Supabase (Postgres, Auth, Storage, RLS) with `@supabase/ssr`
- **UI:** Tailwind CSS + shadcn/ui, lucide-react
- **Fonts:** Poppins & Clash Grotesk
- **PDF Generation:** `@react-pdf/renderer`
- **Email:** Resend

## Setup Instructions

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Populate the required environment variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://bhbgkhyewxaacqnjltwr.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   RESEND_API_KEY=re_...
   EMAIL_FROM="EduBridge Education <receipts@edubridgeeducation.com>"
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. Link Supabase project and push database migrations:
   ```bash
   npx supabase link --project-ref bhbgkhyewxaacqnjltwr
   npx supabase db push
   ```

4. Bootstrap initial owner account:
   Once an account is registered in Supabase Auth, run this snippet in the Supabase SQL editor:
   ```sql
   -- Bootstrap owner role for the primary administrator
   update public.profiles
   set role = 'owner'
   where id = (select id from auth.users where email = 'OWNER_EMAIL');
   ```

5. Run development server:
   ```bash
   npm run dev
   ```

6. Run build & lint:
   ```bash
   npm run build
   npm run lint
   ```

## Supported Origins & HTTPS Requirement
- **Supported**: `http://localhost:3000` (local dev/testing), HTTPS tunnels (e.g. Cloudflare Tunnel / ngrok), and production HTTPS.
- **Unsupported**: Plain HTTP over a LAN IP (e.g. `http://192.168.x.x:3000`). Modern browsers do not treat non-localhost HTTP origins as Secure Contexts, which blocks `navigator.geolocation` (required for GPS attendance punches) and `Secure` session cookies in production mode.
