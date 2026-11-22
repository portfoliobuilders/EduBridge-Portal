-- ==============================================================================
-- Migration: 0047_revoke_public_execute_on_internal_functions.sql
-- Description:
--   Revoke default PUBLIC execute privilege on public schema functions.
--   Only allow anon to execute public receipt/statement/rate limit RPCs.
--   Ensure background/cron engines cannot be invoked by authenticated users.
-- ==============================================================================

-- Revoke default execute on all public functions from public and anon
revoke execute on all functions in schema public from public, anon;

-- Re-grant execute to authenticated for legitimate application RPCs
grant execute on all functions in schema public to authenticated;

-- Grant execute to anon ONLY on public share endpoints and rate limiter
grant execute on function public.get_public_receipt(uuid) to anon, authenticated;
grant execute on function public.get_public_statement(uuid) to anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to anon, authenticated;

-- Strictly revoke background cron / trigger functions from authenticated and anon
revoke all on function public.create_notification(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.process_daily_celebrations(date) from public, anon, authenticated;
revoke all on function public.process_daily_attendance_close() from public, anon, authenticated;
revoke all on function public.process_daily_attendance_absences(date) from public, anon, authenticated;
