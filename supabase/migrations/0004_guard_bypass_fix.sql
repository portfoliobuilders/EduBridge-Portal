-- =============================================================================
-- Migration: 0004_guard_bypass_fix.sql
-- Description: Fix guard_profile_updates to bypass only for true DB-level admin
--              roles (postgres, supabase_admin, service_role) instead of using
--              auth.uid() is null which is too permissive.
-- =============================================================================

create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_active_owners_count int;
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    -- Allow only true database-level admin roles to bypass this guard.
    -- current_user is the DB role, not the authenticated Supabase user.
    -- auth.uid() is not null alone is too broad: it allows any authenticated
    -- Supabase user with no owner claim to bypass when uid is set.
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      if not public.is_owner() then
        raise exception 'Only owners can modify profile roles or active status';
      end if;
    end if;

    -- Prevent last active owner from demoting or deactivating themselves
    if old.role = 'owner' and (new.role != 'owner' or new.is_active = false) then
      select count(*) into v_active_owners_count
      from profiles
      where role = 'owner' and is_active = true and id != old.id;

      if v_active_owners_count = 0 then
        raise exception 'Cannot deactivate or demote the last remaining active owner';
      end if;
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

-- Keep revoke in sync (trigger functions need no grants)
revoke execute on function public.guard_profile_updates() from public, anon, authenticated;
