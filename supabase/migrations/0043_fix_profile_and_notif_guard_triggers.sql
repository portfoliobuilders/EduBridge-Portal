-- ==============================================================================
-- Migration: 0043_fix_profile_and_notif_guard_triggers.sql
-- Description:
--   Fix SECURITY DEFINER trigger bypass in guard_profile_admin_fields
--   and trg_guard_notification_updates (current_user inside security definer is
--   always the owner 'postgres'; check v_caller_id is null instead).
-- ==============================================================================

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
  -- Bypass only when no authenticated caller context (migrations, system seeds)
  if v_caller_id is null then
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

create or replace function public.trg_guard_notification_updates()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  -- Bypass only when no authenticated caller context
  if v_caller_id is null then
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
