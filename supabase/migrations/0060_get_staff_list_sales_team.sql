-- Migration: 0060_get_staff_list_sales_team.sql
-- Description: Include is_sales_team in get_staff_list RPC return table

drop function if exists public.get_staff_list();

create or replace function public.get_staff_list()
  returns table (
    id uuid,
    full_name text,
    email text,
    phone text,
    role app_role,
    job_title text,
    reports_to uuid,
    reports_to_name text,
    admin_scope text,
    is_support boolean,
    is_sales_team boolean,
    is_active boolean,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    collections_this_month numeric(12,2)
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin_or_above() then
    raise exception 'Access denied: staff management requires Admin or Super Admin privileges';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    p.role,
    p.job_title,
    p.reports_to,
    mgr.full_name as reports_to_name,
    p.admin_scope,
    p.is_support,
    p.is_sales_team,
    p.is_active,
    u.last_sign_in_at,
    p.created_at,
    coalesce(coll.total, 0::numeric(12,2)) as collections_this_month
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profiles mgr on mgr.id = p.reports_to
  left join lateral (
    select sum(amount) as total
    from public.payments
    where received_by = p.id
      and status = 'valid'
      and paid_at >= date_trunc('month', now() at time zone 'Asia/Dubai')
  ) coll on true
  where p.id in (select * from public.visible_user_ids())
  order by
    case p.role::text
      when 'super_admin' then 1
      when 'admin' then 2
      when 'staff' then 3
      else 4
    end,
    p.full_name;
end;
$$;

revoke all on function public.get_staff_list() from public, anon;
grant execute on function public.get_staff_list() to authenticated;
