-- Migration: 0002_security_fixes.sql
-- Description: Update guard_profile_updates to allow admin/CLI operations and revoke execute on rls_auto_enable

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
    if auth.uid() is not null and not public.is_owner() then
      raise exception 'Only owners can modify profile roles or active status';
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

revoke execute on function public.guard_profile_updates() from public, anon, authenticated;

-- Revoke execute on rls_auto_enable if it exists in public
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
