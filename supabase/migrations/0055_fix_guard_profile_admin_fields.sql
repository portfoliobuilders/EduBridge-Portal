-- ==============================================================================
-- Migration: 0055_fix_guard_profile_admin_fields.sql
-- Description:
--   Updates guard_profile_admin_fields to block staff from modifying celebration
--   flags (celebrate_birthday, celebrate_anniversary) and enforce active status on reports_to.
-- ==============================================================================

create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_caller_active boolean;
  v_caller_id uuid := auth.uid();
begin
  -- Bypass only when no authenticated caller context (migrations, system seeds run directly as postgres)
  if v_caller_id is null then
    return new;
  end if;

  select role::text, is_active into v_caller_role, v_caller_active
  from public.profiles
  where id = v_caller_id;

  -- Forbidden if caller has no profile row or is inactive
  if v_caller_role is null or v_caller_active is not true then
    raise exception 'forbidden: caller has no active profile';
  end if;

  -- 1. SUPER_ADMIN / OWNER: full privileges except cannot demote or deactivate the last active super_admin
  if v_caller_role in ('super_admin', 'owner') then
    if old.role::text in ('super_admin', 'owner') and old.is_active = true and
       (new.role::text not in ('super_admin', 'owner') or new.is_active = false) then
      if (select count(*) from public.profiles where role in ('super_admin', 'owner') and is_active = true and id != old.id) < 1 then
        raise exception 'forbidden: cannot deactivate or demote the last active super_admin';
      end if;
    end if;

    -- If reports_to changed, target must be an active staff member
    if new.reports_to is distinct from old.reports_to and new.reports_to is not null then
      if not exists (select 1 from public.profiles where id = new.reports_to and is_active = true) then
        raise exception 'forbidden: reports_to must be an active staff member';
      end if;
    end if;

    return new;
  end if;

  -- 2. ADMIN: strictly scoped
  if v_caller_role = 'admin' then
    -- Admin updating their own profile
    if old.id = v_caller_id then
      if (new.role is distinct from old.role) or
         (new.admin_scope is distinct from old.admin_scope) or
         (new.reports_to is distinct from old.reports_to) or
         (new.is_active is distinct from old.is_active) or
         (new.is_support is distinct from old.is_support) or
         (new.work_email is distinct from old.work_email) or
         (new.job_title is distinct from old.job_title) or
         (new.employee_id is distinct from old.employee_id) or
         (new.joining_date is distinct from old.joining_date) or
         (new.celebrate_birthday is distinct from old.celebrate_birthday) or
         (new.celebrate_anniversary is distinct from old.celebrate_anniversary) then
        raise exception 'forbidden: admins cannot modify own administrative or celebration fields';
      end if;
      return new;
    end if;

    -- Admin updating another profile
    -- Must only update staff members (cannot edit other admins or super_admins)
    if old.role::text != 'staff' then
      raise exception 'forbidden: admins can only manage staff members';
    end if;

    -- Must be within admin's visible scope
    if not (old.id in (select user_id from public.visible_user_ids())) then
      raise exception 'forbidden: staff member is outside your administrative scope';
    end if;

    -- Cannot change role (no promotion to admin/super_admin)
    if new.role is distinct from old.role then
      raise exception 'forbidden: admins cannot change roles';
    end if;

    -- Cannot change admin_scope, is_support, work_email
    if new.admin_scope is distinct from old.admin_scope then
      raise exception 'forbidden: admins cannot configure admin scope';
    end if;

    if new.is_support is distinct from old.is_support then
      raise exception 'forbidden: admins cannot configure support flag';
    end if;

    if new.work_email is distinct from old.work_email then
      raise exception 'forbidden: admins cannot change work email';
    end if;

    -- reports_to can only be set to someone within visible scope (or null) AND must be active
    if new.reports_to is distinct from old.reports_to and new.reports_to is not null then
      if not (new.reports_to in (select user_id from public.visible_user_ids())) then
        raise exception 'forbidden: cannot assign reports_to outside your administrative scope';
      end if;
      if not exists (select 1 from public.profiles where id = new.reports_to and is_active = true) then
        raise exception 'forbidden: reports_to must be an active staff member';
      end if;
    end if;

    -- Allowed privileged fields for admin on staff: job_title, employee_id, joining_date, reports_to (in scope), is_active, celebrate_birthday, celebrate_anniversary
    return new;
  end if;

  -- 3. STAFF / OTHER ROLES
  if old.id != v_caller_id then
    raise exception 'forbidden: staff cannot modify other profiles';
  end if;

  if (new.job_title is distinct from old.job_title) or
     (new.employee_id is distinct from old.employee_id) or
     (new.joining_date is distinct from old.joining_date) or
     (new.role is distinct from old.role) or
     (new.admin_scope is distinct from old.admin_scope) or
     (new.reports_to is distinct from old.reports_to) or
     (new.is_active is distinct from old.is_active) or
     (new.is_support is distinct from old.is_support) or
     (new.work_email is distinct from old.work_email) or
     (new.celebrate_birthday is distinct from old.celebrate_birthday) or
     (new.celebrate_anniversary is distinct from old.celebrate_anniversary) then
    raise exception 'forbidden: only administrators can modify job title, employee ID, joining date, role, or celebration settings';
  end if;

  return new;
end;
$$;
