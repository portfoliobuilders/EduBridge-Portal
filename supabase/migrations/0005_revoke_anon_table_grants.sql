-- =============================================================================
-- Migration: 0005_revoke_anon_table_grants.sql
-- Description: Revoke all direct table privileges from the anon role.
--              The anon role should ONLY access data through the
--              get_public_receipt() SECURITY DEFINER function.
--              RLS policies already block anon from seeing any rows, but
--              revoking privileges adds defence-in-depth and passes security
--              advisors.
-- =============================================================================

-- Revoke all direct table privileges from anon on every application table.
-- (These were granted automatically by the rls_auto_enable event trigger.)
revoke all on table public.profiles           from anon;
revoke all on table public.company_settings   from anon;
revoke all on table public.universities       from anon;
revoke all on table public.courses            from anon;
revoke all on table public.specializations    from anon;
revoke all on table public.students           from anon;
revoke all on table public.enrollments        from anon;
revoke all on table public.payments           from anon;
revoke all on table public.audit_log          from anon;
revoke all on table public.share_logs         from anon;

-- Revoke on helper/counter tables if they exist
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='receipt_counters') then
    revoke all on table public.receipt_counters from anon;
  end if;
  if exists (select 1 from pg_tables where schemaname='public' and tablename='student_counters') then
    revoke all on table public.student_counters from anon;
  end if;
  if exists (select 1 from pg_tables where schemaname='public' and tablename='enrollment_ledger') then
    revoke all on table public.enrollment_ledger from anon;
  end if;
end $$;

-- anon still retains EXECUTE on get_public_receipt (granted in 0003).
-- No table-level grants needed for anon — the function uses SECURITY DEFINER
-- and runs as its definer (postgres), which bypasses RLS.
