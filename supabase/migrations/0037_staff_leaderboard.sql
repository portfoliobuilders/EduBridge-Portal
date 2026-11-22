-- ============================================================================
-- Migration: 0037_staff_leaderboard.sql
-- Description:
-- 1. Company settings: show_aed_to_staff & monthly_top_performer_notification
-- 2. get_staff_leaderboard RPC (security definer, role-aware, Dubai periods,
--    tie-breaking by earliest achievement, excludes inactive/test/support)
-- ============================================================================

-- 1. Alter company_settings
alter table public.company_settings
  add column if not exists show_aed_to_staff boolean not null default false;

alter table public.company_settings
  add column if not exists monthly_top_performer_notification boolean not null default false;

-- 2. Staff Leaderboard RPC
create or replace function public.get_staff_leaderboard(
  p_period text default 'this_month',
  p_metric text default 'admissions',
  p_team_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  rank int,
  user_id uuid,
  full_name text,
  first_name text,
  avatar_url text,
  job_title text,
  admissions_count int,
  collections_amount numeric,
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
  v_caller_id uuid;
  v_caller_role text;
  v_show_aed boolean := false;
  v_now_dubai timestamp;
  v_from timestamptz;
  v_to timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_clean_period text;
  v_clean_metric text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_caller_id;

  select coalesce(show_aed_to_staff, false)
  into v_show_aed
  from public.company_settings
  limit 1;

  v_clean_period := lower(coalesce(p_period, 'this_month'));
  v_clean_metric := lower(coalesce(p_metric, 'admissions'));

  -- Calculate period boundaries in Asia/Dubai
  v_now_dubai := now() at time zone 'Asia/Dubai';

  if p_from is not null and p_to is not null then
    v_from := p_from;
    v_to := p_to;
    -- Previous period of equal duration
    v_prev_to := v_from - interval '1 millisecond';
    v_prev_from := v_from - (p_to - p_from);
  elsif v_clean_period in ('this_week', 'week') then
    v_from := (date_trunc('week', v_now_dubai)) at time zone 'Asia/Dubai';
    v_to := (date_trunc('week', v_now_dubai) + interval '1 week' - interval '1 millisecond') at time zone 'Asia/Dubai';
    v_prev_from := (date_trunc('week', v_now_dubai) - interval '1 week') at time zone 'Asia/Dubai';
    v_prev_to := (date_trunc('week', v_now_dubai) - interval '1 millisecond') at time zone 'Asia/Dubai';
  elsif v_clean_period in ('this_quarter', 'quarter') then
    v_from := (date_trunc('quarter', v_now_dubai)) at time zone 'Asia/Dubai';
    v_to := (date_trunc('quarter', v_now_dubai) + interval '3 month' - interval '1 millisecond') at time zone 'Asia/Dubai';
    v_prev_from := (date_trunc('quarter', v_now_dubai) - interval '3 month') at time zone 'Asia/Dubai';
    v_prev_to := (date_trunc('quarter', v_now_dubai) - interval '1 millisecond') at time zone 'Asia/Dubai';
  else
    -- Default to this_month
    v_from := (date_trunc('month', v_now_dubai)) at time zone 'Asia/Dubai';
    v_to := (date_trunc('month', v_now_dubai) + interval '1 month' - interval '1 millisecond') at time zone 'Asia/Dubai';
    v_prev_from := (date_trunc('month', v_now_dubai) - interval '1 month') at time zone 'Asia/Dubai';
    v_prev_to := (date_trunc('month', v_now_dubai) - interval '1 millisecond') at time zone 'Asia/Dubai';
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
      and coalesce(p.work_email, '') not like '%@test.edubridge.local'
      and coalesce(p.work_email, '') not like '%@example.com'
      and coalesce(p.full_name, '') not ilike '%test%'
      and coalesce(p.full_name, '') not ilike 'smoke staff%'
      and coalesce(p.full_name, '') not ilike 'doc staff%'
      and coalesce(p.full_name, '') not ilike 'pw_%'
      -- Team filtering
      and (
        case
          -- Staff always see company leaderboard
          when v_caller_role = 'staff' then true
          -- Admin filtering
          when v_caller_role = 'admin' then
            case
              when p_team_id is not null then p.id in (select vui.user_id from public.visible_user_ids() vui)
              else true
            end
          -- Super Admin / Owner filtering
          when v_caller_role in ('super_admin', 'owner') then
            case
              when p_team_id is not null then (
                p.id = p_team_id
                or p.id in (select tm from public.team_member_ids(p_team_id) tm)
              )
              else true
            end
          else true
        end
      )
  ),
  current_stats as (
    select
      es.staff_id,
      -- Admissions count & earliest achievement timestamp
      coalesce(count(distinct e.id), 0)::int as adm_cnt,
      max(e.created_at) as adm_latest_ts,
      -- Collections amount & earliest achievement timestamp
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
      case
        when v_clean_metric = 'collections' then cs.col_amt
        else cs.adm_cnt::numeric
      end as current_metric_val,
      row_number() over (
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
      case
        when v_clean_metric = 'collections' then ps.prev_col_amt
        else ps.prev_adm_cnt::numeric
      end as prev_metric_val,
      row_number() over (
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
    rc.cur_rank as rank,
    rc.staff_id as user_id,
    rc.full_name,
    rc.f_name as first_name,
    rc.avatar_url,
    rc.job_title,
    rc.adm_cnt as admissions_count,
    -- Role-aware AED masking: null for staff when show_aed_to_staff = false
    case
      when v_caller_role = 'staff' and not v_show_aed then null::numeric
      else rc.col_amt
    end as collections_amount,
    rp.p_rank as prev_rank,
    (rp.p_rank - rc.cur_rank)::int as rank_delta,
    case
      when v_clean_metric = 'collections' and v_caller_role = 'staff' and not v_show_aed then null::numeric
      else (rc.current_metric_val - rp.prev_metric_val)::numeric
    end as value_delta,
    (rc.staff_id = v_caller_id) as is_self
  from ranked_current rc
  join ranked_prev rp on rp.staff_id = rc.staff_id
  order by rc.cur_rank asc;
end;
$$;

revoke all on function public.get_staff_leaderboard(text, text, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_staff_leaderboard(text, text, uuid, timestamptz, timestamptz) to authenticated;
