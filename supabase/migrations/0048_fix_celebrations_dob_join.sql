-- ==============================================================================
-- Migration: 0048_fix_celebrations_dob_join.sql
-- Description:
--   Updates get_celebrations_today and get_upcoming_celebrations_this_week
--   to join staff_sensitive_details for dob (dropped from public.profiles in 0042).
-- ==============================================================================

create or replace function public.get_celebrations_today(p_date date default null)
returns table (
  user_id uuid,
  full_name text,
  first_name text,
  avatar_url text,
  kind text,
  years int,
  joined_month_year text,
  is_self boolean
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_today date := coalesce(p_date, (now() at time zone 'Asia/Dubai')::date);
  v_cur_month int := extract(month from v_today)::int;
  v_cur_day int := extract(day from v_today)::int;
  v_is_leap_year boolean;
  v_caller_id uuid := auth.uid();
begin
  v_is_leap_year := (extract(year from v_today)::int % 4 = 0 and (extract(year from v_today)::int % 100 != 0 or extract(year from v_today)::int % 400 = 0));

  return query
  -- 1. Birthdays today
  select
    p.id as user_id,
    p.full_name,
    split_part(coalesce(p.display_name, p.full_name), ' ', 1) as first_name,
    p.avatar_url,
    'birthday'::text as kind,
    null::int as years,
    null::text as joined_month_year,
    (p.id = v_caller_id) as is_self
  from public.profiles p
  left join public.staff_sensitive_details ssd on ssd.user_id = p.id
  where p.is_active = true
    and p.celebrate_birthday = true
    and ssd.dob is not null
    and (
      (extract(month from ssd.dob)::int = v_cur_month and extract(day from ssd.dob)::int = v_cur_day)
      or (not v_is_leap_year and v_cur_month = 2 and v_cur_day = 28 and extract(month from ssd.dob)::int = 2 and extract(day from ssd.dob)::int = 29)
    )

  union all

  -- 2. Work anniversaries today (minimum 1 year)
  select
    p.id as user_id,
    p.full_name,
    split_part(coalesce(p.display_name, p.full_name), ' ', 1) as first_name,
    p.avatar_url,
    'anniversary'::text as kind,
    (extract(year from v_today)::int - extract(year from p.joining_date)::int) as years,
    to_char(p.joining_date, 'Mon YYYY') as joined_month_year,
    (p.id = v_caller_id) as is_self
  from public.profiles p
  where p.is_active = true
    and p.celebrate_anniversary = true
    and p.joining_date is not null
    and (extract(year from v_today)::int - extract(year from p.joining_date)::int) >= 1
    and (
      (extract(month from p.joining_date)::int = v_cur_month and extract(day from p.joining_date)::int = v_cur_day)
      or (not v_is_leap_year and v_cur_month = 2 and v_cur_day = 28 and extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29)
    );
end;
$$;

revoke all on function public.get_celebrations_today(date) from public, anon;
grant execute on function public.get_celebrations_today(date) to authenticated;

create or replace function public.get_upcoming_celebrations_this_week()
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  kind text,
  celebration_date text,
  days_away int,
  years int
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_cur_year int := extract(year from v_today)::int;
begin
  return query
  with dates as (
    select
      p.id as u_id,
      p.full_name as u_name,
      p.avatar_url as u_avatar,
      'birthday'::text as c_kind,
      ssd.dob as event_date,
      null::int as anniv_years,
      case
        when make_date(v_cur_year, extract(month from ssd.dob)::int, case when extract(month from ssd.dob)::int = 2 and extract(day from ssd.dob)::int = 29 then 28 else extract(day from ssd.dob)::int end) >= v_today
        then make_date(v_cur_year, extract(month from ssd.dob)::int, case when extract(month from ssd.dob)::int = 2 and extract(day from ssd.dob)::int = 29 then 28 else extract(day from ssd.dob)::int end)
        else make_date(v_cur_year + 1, extract(month from ssd.dob)::int, case when extract(month from ssd.dob)::int = 2 and extract(day from ssd.dob)::int = 29 then 28 else extract(day from ssd.dob)::int end)
      end as next_occurrence
    from public.profiles p
    left join public.staff_sensitive_details ssd on ssd.user_id = p.id
    where p.is_active = true and p.celebrate_birthday = true and ssd.dob is not null

    union all

    select
      p.id as u_id,
      p.full_name as u_name,
      p.avatar_url as u_avatar,
      'anniversary'::text as c_kind,
      p.joining_date as event_date,
      (v_cur_year - extract(year from p.joining_date)::int) as anniv_years,
      case
        when make_date(v_cur_year, extract(month from p.joining_date)::int, case when extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29 then 28 else extract(day from p.joining_date)::int end) >= v_today
        then make_date(v_cur_year, extract(month from p.joining_date)::int, case when extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29 then 28 else extract(day from p.joining_date)::int end)
        else make_date(v_cur_year + 1, extract(month from p.joining_date)::int, case when extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29 then 28 else extract(day from p.joining_date)::int end)
      end as next_occurrence
    from public.profiles p
    where p.is_active = true and p.celebrate_anniversary = true and p.joining_date is not null
      and (v_cur_year - extract(year from p.joining_date)::int) >= 1
  )
  select
    d.u_id as user_id,
    d.u_name as full_name,
    d.u_avatar as avatar_url,
    d.c_kind as kind,
    to_char(d.next_occurrence, 'DD Mon') as celebration_date,
    (d.next_occurrence - v_today)::int as days_away,
    d.anniv_years as years
  from dates d
  where (d.next_occurrence - v_today) between 0 and 7
  order by (d.next_occurrence - v_today) asc, d.u_name asc;
end;
$$;

revoke all on function public.get_upcoming_celebrations_this_week() from public, anon;
grant execute on function public.get_upcoming_celebrations_this_week() to authenticated;
