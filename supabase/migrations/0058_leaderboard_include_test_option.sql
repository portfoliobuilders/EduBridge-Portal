-- Migration: 0058_leaderboard_include_test_option.sql
-- Add p_include_test parameter to get_staff_leaderboard to support isolated testing
-- with disposable test users without polluting production rankings or touching real users.

drop function if exists public.get_staff_leaderboard(text, text, uuid, timestamptz, timestamptz);

create or replace function public.get_staff_leaderboard(
  p_period text default 'this_month',
  p_metric text default 'collections',
  p_team_id uuid default null,
  p_custom_from timestamptz default null,
  p_custom_to timestamptz default null,
  p_include_test boolean default false
)
returns table (
  user_id uuid,
  full_name text,
  first_name text,
  avatar_url text,
  job_title text,
  admissions_count int,
  collections_amount numeric,
  rank int,
  prev_rank int,
  rank_delta int,
  value_delta numeric,
  is_self boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_show_aed boolean := false;
  v_from timestamptz;
  v_to timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_dubai_now timestamptz := now() at time zone 'Asia/Dubai';
  v_clean_metric text := coalesce(nullif(trim(p_metric), ''), 'collections');
  v_clean_period text := coalesce(nullif(trim(p_period), ''), 'this_month');
begin
  if v_caller_id is null then
    return;
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  select show_aed_to_staff into v_show_aed from public.company_settings limit 1;
  v_show_aed := coalesce(v_show_aed, false);

  if p_custom_from is not null and p_custom_to is not null then
    v_from := p_custom_from;
    v_to := p_custom_to;
    v_prev_from := v_from - (v_to - v_from);
    v_prev_to := v_from;
  elsif v_clean_period = 'today' then
    v_from := date_trunc('day', v_dubai_now);
    v_to := v_from + interval '1 day' - interval '1 microsecond';
    v_prev_from := v_from - interval '1 day';
    v_prev_to := v_from - interval '1 microsecond';
  elsif v_clean_period = 'this_week' then
    v_from := date_trunc('week', v_dubai_now);
    v_to := v_from + interval '1 week' - interval '1 microsecond';
    v_prev_from := v_from - interval '1 week';
    v_prev_to := v_from - interval '1 microsecond';
  elsif v_clean_period = 'last_month' then
    v_from := date_trunc('month', v_dubai_now - interval '1 month');
    v_to := date_trunc('month', v_dubai_now) - interval '1 microsecond';
    v_prev_from := date_trunc('month', v_dubai_now - interval '2 month');
    v_prev_to := v_from - interval '1 microsecond';
  elsif v_clean_period = 'this_quarter' then
    v_from := date_trunc('quarter', v_dubai_now);
    v_to := v_from + interval '3 month' - interval '1 microsecond';
    v_prev_from := v_from - interval '3 month';
    v_prev_to := v_from - interval '1 microsecond';
  elsif v_clean_period = 'this_year' then
    v_from := date_trunc('year', v_dubai_now);
    v_to := v_from + interval '1 year' - interval '1 microsecond';
    v_prev_from := v_from - interval '1 year';
    v_prev_to := v_from - interval '1 microsecond';
  elsif v_clean_period = 'all_time' then
    v_from := '2000-01-01 00:00:00+00'::timestamptz;
    v_to := '2099-12-31 23:59:59+00'::timestamptz;
    v_prev_from := '1900-01-01 00:00:00+00'::timestamptz;
    v_prev_to := '1999-12-31 23:59:59+00'::timestamptz;
  else
    -- Default 'this_month'
    v_from := date_trunc('month', v_dubai_now);
    v_to := date_trunc('month', v_dubai_now) + interval '1 month' - interval '1 microsecond';
    v_prev_from := date_trunc('month', v_dubai_now - interval '1 month');
    v_prev_to := v_from - interval '1 microsecond';
  end if;

  return query
  with eligible_staff as (
    select
      p.id as staff_id,
      p.full_name,
      split_part(trim(p.full_name), ' ', 1) as f_name,
      p.avatar_url,
      p.job_title
    from public.profiles p
    where p.is_active = true
      and coalesce(p.is_support, false) = false
      and (
        p_include_test
        or (
          coalesce(p.work_email, '') not like '%@test.edubridge.local'
          and coalesce(p.work_email, '') not like '%@example.com'
          and coalesce(p.full_name, '') not ilike '%test%'
          and coalesce(p.full_name, '') not ilike 'smoke staff%'
          and coalesce(p.full_name, '') not ilike 'doc staff%'
          and coalesce(p.full_name, '') not ilike 'pw_%'
        )
      )
      -- Team filtering
      and (
        case
          when v_caller_role = 'staff' then true
          when v_caller_role = 'admin' then
            case
              when p_team_id is not null then p.id in (select vui.user_id from public.visible_user_ids() vui)
              else true
            end
          when v_caller_role in ('super_admin', 'owner') then
            case
              when p_team_id is not null then (
                p.id = p_team_id
                or p.id in (select tm from public.team_member_ids(p_team_id) tm)
              )
              else true
            end
          else false
        end
      )
  ),
  current_stats as (
    select
      es.staff_id,
      coalesce(count(distinct e.id), 0)::int as adm_cnt,
      max(e.created_at) as adm_latest_ts,
      coalesce(sum(case when pay.status = 'valid' then pay.amount else 0 end), 0.00)::numeric(12,2) as col_amt,
      max(case when pay.status = 'valid' then pay.paid_at else null end) as col_latest_ts
    from eligible_staff es
    left join public.enrollments e
      on e.admission_staff_id = es.staff_id
      and e.created_at >= v_from
      and e.created_at <= v_to
    left join public.payments pay
      on pay.received_by = es.staff_id
      and pay.status = 'valid'
      and pay.paid_at >= v_from
      and pay.paid_at <= v_to
    group by es.staff_id
  ),
  prev_stats as (
    select
      es.staff_id,
      coalesce(count(distinct e.id), 0)::int as prev_adm_cnt,
      max(e.created_at) as prev_adm_latest_ts,
      coalesce(sum(case when pay.status = 'valid' then pay.amount else 0 end), 0.00)::numeric(12,2) as prev_col_amt,
      max(case when pay.status = 'valid' then pay.paid_at else null end) as prev_col_latest_ts
    from eligible_staff es
    left join public.enrollments e
      on e.admission_staff_id = es.staff_id
      and e.created_at >= v_prev_from
      and e.created_at <= v_prev_to
    left join public.payments pay
      on pay.received_by = es.staff_id
      and pay.status = 'valid'
      and pay.paid_at >= v_prev_from
      and pay.paid_at <= v_prev_to
    group by es.staff_id
  ),
  ranked_current as (
    select
      es.staff_id,
      es.full_name,
      es.f_name,
      es.avatar_url,
      es.job_title,
      cs.adm_cnt,
      cs.col_amt,
      dense_rank() over (
        order by
          case
            when v_clean_metric = 'collections' then cs.col_amt
            else cs.adm_cnt::numeric
          end desc,
          case
            when v_clean_metric = 'collections' then cs.col_latest_ts
            else cs.adm_latest_ts
          end asc nulls last,
          es.full_name asc
      )::int as cur_rank
    from eligible_staff es
    join current_stats cs on cs.staff_id = es.staff_id
  ),
  ranked_prev as (
    select
      es.staff_id,
      ps.prev_adm_cnt,
      ps.prev_col_amt,
      dense_rank() over (
        order by
          case
            when v_clean_metric = 'collections' then ps.prev_col_amt
            else ps.prev_adm_cnt::numeric
          end desc,
          case
            when v_clean_metric = 'collections' then ps.prev_col_latest_ts
            else ps.prev_adm_latest_ts
          end asc nulls last,
          es.full_name asc
      )::int as p_rank
    from eligible_staff es
    join prev_stats ps on ps.staff_id = es.staff_id
  )
  select
    rc.staff_id as user_id,
    rc.full_name,
    rc.f_name as first_name,
    rc.avatar_url,
    rc.job_title,
    rc.adm_cnt as admissions_count,
    case
      when v_caller_role in ('super_admin', 'owner', 'admin') or v_show_aed = true then rc.col_amt
      else null::numeric
    end as collections_amount,
    rc.cur_rank as rank,
    rp.p_rank as prev_rank,
    (rp.p_rank - rc.cur_rank)::int as rank_delta,
    case
      when v_clean_metric = 'collections' then
        case
          when v_caller_role in ('super_admin', 'owner', 'admin') or v_show_aed = true then (rc.col_amt - rp.prev_col_amt)::numeric
          else null::numeric
        end
      else
        (rc.adm_cnt - rp.prev_adm_cnt)::numeric
    end as value_delta,
    (rc.staff_id = v_caller_id) as is_self
  from ranked_current rc
  join ranked_prev rp on rp.staff_id = rc.staff_id
  order by rc.cur_rank asc, rc.full_name asc;
end;
$$;

revoke all on function public.get_staff_leaderboard(text, text, uuid, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.get_staff_leaderboard(text, text, uuid, timestamptz, timestamptz, boolean) to authenticated;
