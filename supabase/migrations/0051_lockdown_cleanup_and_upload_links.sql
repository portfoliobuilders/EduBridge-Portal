-- Migration 0051: Lockdown cleanup_test_attendance_user and document_upload_links direct insert

-- 1. Lockdown cleanup_test_attendance_user
-- Revoke EXECUTE from public, anon, authenticated; only service_role (and postgres) can run it
revoke all on function public.cleanup_test_attendance_user(uuid) from public, anon, authenticated;
grant execute on function public.cleanup_test_attendance_user(uuid) to service_role;

-- Update function definition to only allow service_role / postgres
create or replace function public.cleanup_test_attendance_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not (auth.jwt()->>'role' = 'service_role' or current_user in ('postgres', 'service_role')) then
    raise exception 'forbidden: unauthorized';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null or not v_email like '%@test.edubridge.local' then
    raise exception 'forbidden: can only cleanup test users';
  end if;

  set local app.allow_test_data_cleanup = 'true';
  delete from public.attendance_punches where user_id = p_user_id;
  delete from public.attendance_days where user_id = p_user_id;
  delete from public.leave_requests where user_id = p_user_id;
  delete from public.regularization_requests where user_id = p_user_id;
  delete from public.staff_attendance_settings where user_id = p_user_id;
end;
$$;

-- 2. Direct insert lockdown on document_upload_links
-- Remove direct INSERT policy so authenticated users cannot insert directly (must use create_document_upload_link RPC)
drop policy if exists "Staff can create upload links" on public.document_upload_links;
