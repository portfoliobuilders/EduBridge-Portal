import * as dotenv from 'dotenv';
import * as path from 'path';

export default async function globalSetup() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const prodRef = process.env.PRODUCTION_SUPABASE_REF;

  // Guard: If PRODUCTION_SUPABASE_REF is set, abort if URL contains it.
  if (prodRef && url.includes(prodRef)) {
    throw new Error(
      `[SECURITY GUARD] Playwright test suite aborted: NEXT_PUBLIC_SUPABASE_URL contains the production project ref '${prodRef}'. E2E tests must never run against production!`
    );
  }

  // Default guard: abort if PRODUCTION_SUPABASE_REF is unset AND url is not the dev ref bhbgkhyewxaacqnjltwr
  const DEV_PROJECT_REF = 'bhbgkhyewxaacqnjltwr';
  if (!prodRef && !url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      `[SECURITY GUARD] Playwright test suite aborted: PRODUCTION_SUPABASE_REF is unset and NEXT_PUBLIC_SUPABASE_URL does not match known dev project '${DEV_PROJECT_REF}'.`
    );
  }
}
