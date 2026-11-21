-- =============================================================================
-- Migration: 0006_guard_security_invoker.sql
-- Description: Define guard_profile_updates() as SECURITY INVOKER (remove
--              SECURITY DEFINER) and grant EXECUTE to authenticated.
--              As a SECURITY DEFINER function, current_user in PostgreSQL is
--              always the definer (postgres), causing the admin bypass check
--              to falsely match even when called by authenticated end-users.
--              As SECURITY INVOKER, current_user reflects the actual caller
--              ('authenticated', 'anon', 'postgres', or 'service_role').
-- =============================================================================

create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_active_owners_count int;
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    -- Allow only true database-level admin roles to bypass this guard
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

grant execute on function public.guard_profile_updates() to authenticated;
