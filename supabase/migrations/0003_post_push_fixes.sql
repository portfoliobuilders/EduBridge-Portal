-- =============================================================================
-- Migration: 0003_post_push_fixes.sql
-- Description: Changes incorrectly applied to 0001_core.sql after it was
--              pushed to the remote database:
--              1. Install extensions into the extensions schema
--              2. Fix search_path on all SECURITY DEFINER functions
--              3. Revoke EXECUTE from public/anon/authenticated on all
--                 non-public-facing functions (Supabase grants these by
--                 default, so "revoke from public" alone is not enough)
--              4. Use extensions-schema-qualified operator class for pg_trgm index
-- =============================================================================

-- 1. Ensure extensions are installed in the extensions schema
create extension if not exists "pg_trgm" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- 2. Fix search_path on all SECURITY DEFINER functions using ALTER FUNCTION.
--    We use ALTER FUNCTION (not CREATE OR REPLACE) to avoid changing signatures.

alter function public.is_active_user()
  set search_path = public, extensions;

alter function public.is_owner()
  set search_path = public, extensions;

alter function public.handle_new_user()
  set search_path = public, extensions;

alter function public.guard_profile_updates()
  set search_path = public, extensions;

alter function public.generate_student_code()
  set search_path = public, extensions;

alter function public.validate_enrollment()
  set search_path = public, extensions;

alter function public.record_payment(
  uuid, numeric, payment_mode, payment_purpose,
  text, text, timestamp with time zone, text, text, uuid
)
  set search_path = public, extensions;

alter function public.void_payment(uuid, text)
  set search_path = public, extensions;

alter function public.rotate_share_token(uuid)
  set search_path = public, extensions;

alter function public.get_public_receipt(uuid)
  set search_path = public, extensions;

-- 3. Revoke EXECUTE from public/anon/authenticated for all non-public functions
--    then re-grant selectively.

revoke execute on function public.is_active_user() from public, anon, authenticated;
grant  execute on function public.is_active_user() to authenticated;

revoke execute on function public.is_owner() from public, anon, authenticated;
grant  execute on function public.is_owner() to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_updates() from public, anon, authenticated;
revoke execute on function public.generate_student_code() from public, anon, authenticated;
revoke execute on function public.validate_enrollment() from public, anon, authenticated;

revoke execute on function public.record_payment(
  uuid, numeric, payment_mode, payment_purpose,
  text, text, timestamp with time zone, text, text, uuid
) from public, anon, authenticated;
grant  execute on function public.record_payment(
  uuid, numeric, payment_mode, payment_purpose,
  text, text, timestamp with time zone, text, text, uuid
) to authenticated;

revoke execute on function public.void_payment(uuid, text) from public, anon, authenticated;
grant  execute on function public.void_payment(uuid, text) to authenticated;

revoke execute on function public.rotate_share_token(uuid) from public, anon, authenticated;
grant  execute on function public.rotate_share_token(uuid) to authenticated;

revoke execute on function public.get_public_receipt(uuid) from public, anon, authenticated;
grant  execute on function public.get_public_receipt(uuid) to anon, authenticated;

-- Revoke rls_auto_enable if it exists (event trigger function; just remove public access)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated;';
  end if;
end $$;

-- 4. Re-create the pg_trgm search index with the extensions-schema operator class
--    (original used gin_trgm_ops without schema; Supabase needs extensions.gin_trgm_ops)
drop index if exists idx_students_search;
create index if not exists idx_students_search
  on students using gin (
    (full_name || ' ' || coalesce(mobile, '') || ' ' || coalesce(student_code, ''))
    extensions.gin_trgm_ops
  );
