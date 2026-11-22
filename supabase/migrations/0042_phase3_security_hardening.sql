-- ==============================================================================
-- Migration: 0042_phase3_security_hardening.sql
-- Description:
--   1. Drop sensitive profile columns from public.profiles (now in staff_sensitive_details)
--   2. Hardened guard_profile_admin_fields trigger (protects is_support, work_email, etc.)
--   3. Notification safety: link internal check constraint and update trigger (read_at only)
--   4. Revoke anon/authenticated permissions on internal RPCs and cron triggers
--   5. Fix celebration_emails_enabled default to false
-- ==============================================================================

-- 1. Drop sensitive profile columns from profiles (prevent data leakage across tenant)
drop trigger if exists trg_sync_profile_sensitive_details on public.profiles;
drop function if exists public.sync_profile_sensitive_details();

alter table public.profiles
  drop column if exists dob,
  drop column if exists address,
  drop column if exists personal_email,
  drop column if exists emergency_contact_name,
  drop column if exists emergency_contact_phone;

-- 2. Hardened guard_profile_admin_fields
create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_caller_id uuid := auth.uid();
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or v_caller_id is null then
    return new;
  end if;

  select role::text into v_caller_role
  from public.profiles
  where id = v_caller_id;

  -- If non-admin is updating
  if v_caller_role not in ('super_admin', 'owner', 'admin') then
    if (new.job_title is distinct from old.job_title) or
       (new.employee_id is distinct from old.employee_id) or
       (new.joining_date is distinct from old.joining_date) or
       (new.role is distinct from old.role) or
       (new.admin_scope is distinct from old.admin_scope) or
       (new.reports_to is distinct from old.reports_to) or
       (new.is_active is distinct from old.is_active) or
       (new.is_support is distinct from old.is_support) or
       (new.work_email is distinct from old.work_email) then
      raise exception 'forbidden: only administrators can modify job title, employee ID, joining date, or role fields';
    end if;
  elsif v_caller_role = 'admin' then
    -- Admin cannot modify someone outside their visible scope
    if old.id != v_caller_id and not (old.id in (select user_id from public.visible_user_ids())) then
      raise exception 'forbidden: admins can only update staff members within their scope';
    end if;
    -- Admin cannot promote to super_admin or change their own role/scope
    if new.role::text in ('super_admin', 'owner') and old.role::text not in ('super_admin', 'owner') then
      raise exception 'forbidden: admins cannot assign super_admin or owner roles';
    end if;
    -- Admin cannot change their own role
    if new.id = v_caller_id and new.role::text != old.role::text then
      raise exception 'forbidden: admins cannot change their own role';
    end if;
  end if;

  return new;
end;
$$;

-- 3. Notifications security
-- 3a. Constraint ensuring link is null or an internal path starting with / and not //
alter table public.notifications drop constraint if exists notifications_link_internal_check;
alter table public.notifications
  add constraint notifications_link_internal_check
  check (link is null or (left(link, 1) = '/' and left(link, 2) <> '//'));

-- 3b. Trigger ensuring regular authenticated users can only update read_at
create or replace function public.trg_guard_notification_updates()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or auth.uid() is null then
    return new;
  end if;

  if (new.id is distinct from old.id) or
     (new.user_id is distinct from old.user_id) or
     (new.type is distinct from old.type) or
     (new.title is distinct from old.title) or
     (new.body is distinct from old.body) or
     (new.link is distinct from old.link) or
     (new.entity_type is distinct from old.entity_type) or
     (new.entity_id is distinct from old.entity_id) or
     (new.created_at is distinct from old.created_at) then
    raise exception 'forbidden: users may only update read_at on notifications';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_notification_updates on public.notifications;
create trigger trg_guard_notification_updates
  before update on public.notifications
  for each row
  execute function public.trg_guard_notification_updates();

-- 4. Function permissions hardening
-- 4a. Functions reserved for internal triggers / background cron (revoke from public, anon, authenticated)
revoke all on function public.create_notification(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.process_daily_celebrations(date) from public, anon, authenticated;
revoke all on function public.process_daily_attendance_close() from public, anon, authenticated;
revoke all on function public.process_daily_attendance_absences(date) from public, anon, authenticated;

-- 4b. Revoke execute on internal RPCs and trigger functions from anon
revoke execute on function public.approve_field_punch(uuid, text, text) from anon;
revoke execute on function public.approve_leave_request(uuid, text, text) from anon;
revoke execute on function public.approve_regularization(uuid, text, text) from anon;
revoke execute on function public.check_enrollment_vat_lock() from anon;
revoke execute on function public.dashboard_kpis() from anon;
revoke execute on function public.get_candidate_documents_summary(uuid) from anon;
revoke execute on function public.guard_profile_admin_fields() from anon;
revoke execute on function public.haversine_distance(numeric, numeric, numeric, numeric) from anon;
revoke execute on function public.hit_rate_limit(text, integer, integer) from anon;
revoke execute on function public.notify_on_document_uploaded() from anon;
revoke execute on function public.notify_on_new_enrollment() from anon;
revoke execute on function public.notify_on_payment_recorded() from anon;
revoke execute on function public.notify_on_staff_joined() from anon;
revoke execute on function public.prevent_candidate_document_delete() from anon;
revoke execute on function public.punch(text, numeric, numeric, numeric, text, text, timestamptz, text) from anon;
revoke execute on function public.recalculate_attendance_day(uuid, date) from anon;
revoke execute on function public.trg_audit_staff_attendance_settings() from anon;
revoke execute on function public.trg_prevent_attendance_punch_delete() from anon;
revoke execute on function public.trg_prevent_reports_to_cycle() from anon;
revoke execute on function public.trg_sync_audit_log() from anon;
revoke execute on function public.trg_validate_role_assignment() from anon;

-- 5. Set default of company_settings.celebration_emails_enabled to false
alter table public.company_settings
  alter column celebration_emails_enabled set default false;

update public.company_settings
set celebration_emails_enabled = false
where celebration_emails_enabled = true;
