-- ============================================================================
-- Migration: 0030_fix_visible_user_ids_admin_team.sql
-- Description: Fix public.visible_user_ids() for admin with team scope:
-- include self (v_uid) and properly select setof uuid from team_member_ids().
-- ============================================================================

create or replace function public.visible_user_ids()
returns table(user_id uuid)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_admin_scope text;
begin
  if v_uid is null then
    return;
  end if;

  select role::text, coalesce(admin_scope, 'team')
  into v_role, v_admin_scope
  from public.profiles
  where id = v_uid and is_active = true;

  if v_role in ('super_admin', 'owner') or (v_role = 'admin' and v_admin_scope = 'company') then
    return query
    select id from public.profiles;
  elsif v_role = 'admin' then
    return query
    select v_uid
    union
    select tm from public.team_member_ids(v_uid) tm;
  else
    return query
    select v_uid;
  end if;
end;
$$;
