-- Migration: 0059_attendance_roles_sales_team_work_calendar.sql
-- Description:
-- 1. Add is_sales_team to public.profiles with guard trigger protection
-- 2. Backfill is_sales_team for active staff/admins who are admission_staff on >= 1 enrollment
-- 3. Super admin attendance_required defaults to false; punch() rejects super_admin unless attendance_required = true
-- 4. Update get_staff_leaderboard to include ONLY active is_sales_team staff
-- 5. Fallback weekly_off to company_settings.attendance_default_weekly_off in recalculate_attendance_day & mark_daily_absences

-- ============================================================================
-- 1. Profiles: is_sales_team column
-- ============================================================================
alter table public.profiles
  add column if not exists is_sales_team boolean not null default false;

-- ============================================================================
-- 2. Guard trigger: guard_profile_admin_fields
-- Ensure is_sales_team can only be updated by super_admin or admin in scope,
-- and staff can never set it on themselves.
-- ============================================================================
create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role public.app_role;
  v_caller_admin_scope text;
  v_allowed_user_ids uuid[];
  v_is_service boolean;
begin
  -- Check if caller is service_role
  v_is_service := (
    current_setting('role', true) = 'service_role'
    or coalesce((current_setting('request.jwt.claims', true)::jsonb->>'role'), '') = 'service_role'
  );

  if v_is_service or v_caller_id is null then
    return new;
  end if;

  select role, admin_scope into v_caller_role, v_caller_admin_scope
  from public.profiles
  where id = v_caller_id;

  -- 1. Disallow changing role, is_active, admin_scope, is_sales_team, reports_to, joining_date, employee_id, job_title by regular staff
  if v_caller_role = 'staff' then
    if (new.role is distinct from old.role)
       or (new.is_active is distinct from old.is_active)
       or (new.admin_scope is distinct from old.admin_scope)
       or (new.is_sales_team is distinct from old.is_sales_team)
       or (new.reports_to is distinct from old.reports_to)
       or (new.joining_date is distinct from old.joining_date)
       or (new.employee_id is distinct from old.employee_id)
       or (new.job_title is distinct from old.job_title) then
      raise exception 'Staff members cannot modify administrative employment fields';
    end if;
  end if;

  -- 2. Admin role restrictions: can only modify staff within visible_user_ids()
  if v_caller_role = 'admin' then
    -- Cannot change own role, is_active, admin_scope, or is_sales_team
    if new.id = v_caller_id then
      if (new.role is distinct from old.role)
         or (new.is_active is distinct from old.is_active)
         or (new.admin_scope is distinct from old.admin_scope)
         or (new.is_sales_team is distinct from old.is_sales_team) then
        raise exception 'Admins cannot modify their own administrative status or sales team flag';
      end if;
    else
      -- Target must be within admin's visible scope and must be a staff member
      if not public.can_manage_user(new.id) then
        raise exception 'Permission denied: cannot modify target user outside your administrative scope';
      end if;
      -- Admin cannot change a target user's role to super_admin or admin
      if (new.role is distinct from old.role) and new.role in ('super_admin', 'owner', 'admin') then
        raise exception 'Admins can only assign the staff role';
      end if;
    end if;
  end if;

  -- 3. Super admin restrictions: cannot demote/deactivate the last active super_admin
  if (old.role in ('super_admin', 'owner')) and (new.role not in ('super_admin', 'owner') or new.is_active = false) then
    if (
      select count(*)
      from public.profiles
      where role in ('super_admin', 'owner')
        and is_active = true
        and id != old.id
    ) = 0 then
      raise exception 'Cannot deactivate or change role of the last active super admin';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 3. Backfill is_sales_team
-- Active staff/admins who are admission_staff on at least 1 enrollment -> true
-- Everyone else (including all super_admins) -> false
-- ============================================================================
update public.profiles
set is_sales_team = false;

update public.profiles p
set is_sales_team = true
where p.role in ('staff', 'admin')
  and p.is_active = true
  and exists (
    select 1
    from public.enrollments e
    where e.admission_staff_id = p.id
  );

-- ============================================================================
-- 4. Super Admin Attendance: attendance_required defaults to false
-- Set attendance_required = false for existing super_admins
-- ============================================================================
insert into public.staff_attendance_settings (user_id, attendance_required)
select p.id, false
from public.profiles p
where p.role in ('super_admin', 'owner')
on conflict (user_id) do update
set attendance_required = false;

-- Trigger to default attendance_required = false when a super_admin profile is created/inserted
create or replace function public.default_super_admin_attendance_required()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role in ('super_admin', 'owner') then
    insert into public.staff_attendance_settings (user_id, attendance_required)
    values (new.id, false)
    on conflict (user_id) do update
    set attendance_required = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_default_super_admin_attendance_required on public.profiles;
create trigger trg_default_super_admin_attendance_required
after insert or update of role on public.profiles
for each row
when (new.role in ('super_admin', 'owner'))
execute function public.default_super_admin_attendance_required();

-- ============================================================================
-- 5. Update punch() RPC: reject super_admin unless attendance_required = true
-- ============================================================================
create or replace function public.punch(
  p_kind text,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric default null,
  p_note text default null,
  p_device_hash text default null,
  p_client_time timestamptz default null,
  p_client_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_settings record;
  v_office record;
  v_now timestamptz := clock_timestamp();
  v_tz text := 'Asia/Dubai';
  v_today date;
  v_distance numeric;
  v_inside boolean := false;
  v_req_net boolean := false;
  v_net_match boolean := true;
  v_status text := 'rejected';
  v_reason text := null;
  v_flags text[] := '{}';
  v_last_punch record;
  v_punch_id uuid;
  v_padding numeric := 0;
  v_speed_mps numeric := 0;
  v_prev_device_count integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  if p_kind not in ('in', 'out') then
    return jsonb_build_object('success', false, 'error', 'Invalid punch kind: must be in or out');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or not v_profile.is_active then
    return jsonb_build_object('success', false, 'error', 'Active staff account required');
  end if;

  select * into v_settings from public.staff_attendance_settings where user_id = v_uid;
  if v_settings.user_id is null then
    insert into public.staff_attendance_settings (
      user_id,
      office_id,
      attendance_required
    )
    values (
      v_uid,
      (select id from public.offices where is_active = true limit 1),
      case when v_profile.role in ('super_admin', 'owner') then false else true end
    )
    returning * into v_settings;
  end if;

  -- REJECT super_admin if attendance_required is false
  if v_profile.role in ('super_admin', 'owner') and not coalesce(v_settings.attendance_required, false) then
    return jsonb_build_object('success', false, 'error', 'Attendance is not required for super_admin accounts');
  end if;

  if v_settings.office_id is not null then
    select * into v_office from public.offices where id = v_settings.office_id;
  end if;
  if v_office.id is null then
    select * into v_office from public.offices where is_active = true limit 1;
  end if;

  if v_office.id is null then
    return jsonb_build_object('success', false, 'error', 'No active office configured for attendance');
  end if;

  select coalesce(attendance_timezone, 'Asia/Dubai') into v_tz from public.company_settings limit 1;
  v_today := (v_now at time zone v_tz)::date;

  -- 1. Check open session rules using deterministic ordering
  select * into v_last_punch
  from public.attendance_punches
  where user_id = v_uid
    and status in ('accepted', 'pending_approval')
  order by at desc, created_at desc, id desc
  limit 1;

  if p_kind = 'in' then
    if v_last_punch.id is not null and v_last_punch.kind = 'in' then
      return jsonb_build_object(
        'success', false,
        'error', 'Already punched in. Please punch out before punching in again.'
      );
    end if;
  elsif p_kind = 'out' then
    if v_last_punch.id is null or v_last_punch.kind = 'out' then
      return jsonb_build_object(
        'success', false,
        'error', 'No active session. Please punch in before punching out.'
      );
    end if;
  end if;

  -- 2. Anti-fraud checks
  if p_client_time is not null and abs(extract(epoch from (v_now - p_client_time))) > 300 then
    v_flags := array_append(v_flags, 'clock_skew');
  end if;

  if p_device_hash is not null then
    select count(distinct user_id) into v_prev_device_count
    from public.attendance_punches
    where device_hash = p_device_hash
      and user_id != v_uid
      and at > (v_now - interval '7 days');
    if v_prev_device_count > 0 then
      v_flags := array_append(v_flags, 'device_shared');
    end if;
  end if;

  -- Check impossible travel if last punch exists within 10 minutes
  if v_last_punch.id is not null and v_last_punch.lat is not null and v_last_punch.lng is not null then
    if (v_now - v_last_punch.at) < interval '10 minutes' and (v_now - v_last_punch.at) > interval '0 seconds' then
      v_distance := public.calculate_distance_meters(p_lat, p_lng, v_last_punch.lat, v_last_punch.lng);
      v_speed_mps := v_distance / nullif(extract(epoch from (v_now - v_last_punch.at)), 0);
      if v_speed_mps > 45 then
        v_flags := array_append(v_flags, 'impossible_travel');
      end if;
    end if;
  end if;

  -- 3. Geofence calculation
  v_distance := public.calculate_distance_meters(p_lat, p_lng, v_office.lat, v_office.lng);
  v_padding := least(coalesce(p_accuracy, 0), 50.0);
  v_inside := v_distance <= (v_office.radius_meters + v_padding);

  -- 4. Network restriction check
  v_req_net := coalesce(v_settings.require_network_match, v_office.require_network_match, false);
  if v_req_net then
    if v_office.allowed_ip_ranges is not null and array_length(v_office.allowed_ip_ranges, 1) > 0 then
      if p_client_ip is null or not (p_client_ip = any(v_office.allowed_ip_ranges)) then
        v_net_match := false;
        v_flags := array_append(v_flags, 'network_mismatch');
      end if;
    end if;
  end if;

  -- 5. Determine status
  if v_inside and v_net_match then
    v_status := 'accepted';
    v_reason := null;
  else
    if not v_inside then
      v_reason := format('Outside office geofence: %s m away (max %s m)', round(v_distance, 1), v_office.radius_meters);
    elsif not v_net_match then
      v_reason := 'Network/IP mismatch with registered office connection';
    end if;

    if coalesce(v_settings.allow_field_punch, false) then
      v_status := 'pending_approval';
    else
      v_status := 'rejected';
    end if;
  end if;

  -- 6. Insert punch record
  insert into public.attendance_punches (
    user_id,
    office_id,
    kind,
    at,
    lat,
    lng,
    accuracy,
    is_inside_geofence,
    status,
    rejection_reason,
    note,
    device_hash,
    client_ip,
    flags
  ) values (
    v_uid,
    v_office.id,
    p_kind,
    v_now,
    p_lat,
    p_lng,
    p_accuracy,
    v_inside,
    v_status,
    v_reason,
    p_note,
    p_device_hash,
    p_client_ip,
    v_flags
  ) returning id into v_punch_id;

  -- 7. If accepted, recalculate daily attendance summary
  if v_status = 'accepted' then
    perform public.recalculate_attendance_day(v_uid, v_today);
  end if;

  return jsonb_build_object(
    'success', v_status in ('accepted', 'pending_approval'),
    'status', v_status,
    'punch_id', v_punch_id,
    'is_inside', v_inside,
    'distance_meters', round(v_distance, 1),
    'flags', v_flags,
    'reason', v_reason
  );
end;
$$;

-- ============================================================================
-- 6. Update recalculate_attendance_day & mark_daily_absences
-- Ensure fallback to company_settings.attendance_default_weekly_off
-- ============================================================================
create or replace function public.recalculate_attendance_day(
  p_user_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_settings record;
  v_company record;
  v_tz text := 'Asia/Dubai';
  v_punch record;
  v_first_in timestamptz := null;
  v_last_out timestamptz := null;
  v_worked_minutes integer := 0;
  v_open_in timestamptz := null;
  v_late_minutes integer := 0;
  v_min_full integer := 480; -- 8 hours
  v_min_half integer := 240; -- 4 hours
  v_shift_start_ts timestamptz;
  v_status text := 'weekly_off';
  v_is_holiday boolean := false;
  v_is_leave boolean := false;
  v_dow integer;
  v_has_open_session boolean := false;
  v_effective_weekly_off integer[];
begin
  select * into v_company from public.company_settings limit 1;
  v_tz := coalesce(v_company.attendance_timezone, 'Asia/Dubai');
  v_min_full := round(coalesce(v_company.attendance_min_hours_full_day, 8.0) * 60)::integer;
  v_min_half := round(coalesce(v_company.attendance_min_hours_half_day, 4.0) * 60)::integer;

  select * into v_settings from public.staff_attendance_settings where user_id = p_user_id;

  -- Determine effective weekly off
  if v_settings.weekly_off is not null and array_length(v_settings.weekly_off, 1) > 0 then
    v_effective_weekly_off := v_settings.weekly_off;
  elsif v_company.attendance_default_weekly_off is not null and array_length(v_company.attendance_default_weekly_off, 1) > 0 then
    v_effective_weekly_off := v_company.attendance_default_weekly_off;
  else
    v_effective_weekly_off := '{5}'::integer[]; -- default Friday
  end if;

  -- Check day of week (0 = Sun, 1 = Mon ... 5 = Fri, 6 = Sat)
  v_dow := extract(dow from p_date)::integer;

  -- Check if holiday
  select exists(
    select 1 from public.holidays
    where date = p_date and (office_id is null or office_id = v_settings.office_id)
  ) into v_is_holiday;

  select exists(
    select 1 from public.leave_requests
    where user_id = p_user_id and status = 'approved' and p_date between from_date and to_date
  ) into v_is_leave;

  if v_is_holiday then
    v_status := 'holiday';
  elsif v_is_leave then
    v_status := 'on_leave';
  elsif v_dow = any(v_effective_weekly_off) then
    v_status := 'weekly_off';
  end if;

  for v_punch in
    select * from public.attendance_punches
    where user_id = p_user_id
      and (at at time zone v_tz)::date = p_date
      and status = 'accepted'
    order by at asc, created_at asc, id asc
  loop
    if v_punch.kind = 'in' then
      if v_first_in is null then
        v_first_in := v_punch.at;
      end if;
      v_open_in := v_punch.at;
    elsif v_punch.kind = 'out' and v_open_in is not null then
      v_worked_minutes := v_worked_minutes + round(extract(epoch from (v_punch.at - v_open_in)) / 60.0)::integer;
      v_last_out := v_punch.at;
      v_open_in := null;
    end if;
  end loop;

  if v_open_in is not null then
    v_has_open_session := true;
  end if;

  if v_first_in is not null and v_settings.shift_start is not null then
    v_shift_start_ts := (p_date::text || ' ' || v_settings.shift_start::text)::timestamp at time zone v_tz;
    if v_first_in > (v_shift_start_ts + (coalesce(v_settings.grace_minutes, 15) * interval '1 minute')) then
      v_late_minutes := round(extract(epoch from (v_first_in - v_shift_start_ts)) / 60.0)::integer;
    end if;
  end if;

  if not v_is_holiday and not v_is_leave then
    if v_has_open_session then
      v_status := 'pending';
    elsif v_first_in is null then
      if v_dow = any(v_effective_weekly_off) then
        v_status := 'weekly_off';
      else
        v_status := 'absent';
      end if;
    elsif v_worked_minutes >= v_min_full then
      if v_late_minutes > 0 then
        v_status := 'late';
      else
        v_status := 'present';
      end if;
    elsif v_worked_minutes >= v_min_half then
      v_status := 'half_day';
    else
      v_status := 'absent';
    end if;
  end if;

  insert into public.attendance_days (
    user_id,
    date,
    first_in,
    last_out,
    worked_minutes,
    late_minutes,
    status,
    updated_at
  ) values (
    p_user_id,
    p_date,
    v_first_in,
    v_last_out,
    v_worked_minutes,
    v_late_minutes,
    v_status,
    now()
  ) on conflict (user_id, date) do update
  set
    first_in = excluded.first_in,
    last_out = excluded.last_out,
    worked_minutes = excluded.worked_minutes,
    late_minutes = excluded.late_minutes,
    status = excluded.status,
    updated_at = now();
end;
$$;

create or replace function public.mark_daily_absences(p_date date default null)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_check_date date;
  v_tz text := 'Asia/Dubai';
  v_company record;
  v_staff record;
  v_settings record;
  v_dow integer;
  v_is_holiday boolean;
  v_is_leave boolean;
  v_has_punch boolean;
  v_count integer := 0;
  v_effective_weekly_off integer[];
begin
  select * into v_company from public.company_settings limit 1;
  v_tz := coalesce(v_company.attendance_timezone, 'Asia/Dubai');

  if p_date is null then
    v_check_date := (now() at time zone v_tz)::date - interval '1 day';
  else
    v_check_date := p_date;
  end if;

  v_dow := extract(dow from v_check_date)::integer;

  for v_staff in
    select p.id, p.full_name, p.role
    from public.profiles p
    where p.is_active = true
      and p.role in ('staff', 'admin') -- exclude super_admin by default
  loop
    select * into v_settings
    from public.staff_attendance_settings
    where user_id = v_staff.id;

    -- Skip if attendance is explicitly not required
    if v_settings.attendance_required = false then
      continue;
    end if;

    -- Effective weekly off
    if v_settings.weekly_off is not null and array_length(v_settings.weekly_off, 1) > 0 then
      v_effective_weekly_off := v_settings.weekly_off;
    elsif v_company.attendance_default_weekly_off is not null and array_length(v_company.attendance_default_weekly_off, 1) > 0 then
      v_effective_weekly_off := v_company.attendance_default_weekly_off;
    else
      v_effective_weekly_off := '{5}'::integer[]; -- default Friday
    end if;

    -- Check if holiday
    select exists(
      select 1 from public.holidays
      where date = v_check_date and (office_id is null or office_id = v_settings.office_id)
    ) into v_is_holiday;

    -- Check if approved leave
    select exists(
      select 1 from public.leave_requests
      where user_id = v_staff.id and status = 'approved' and v_check_date between from_date and to_date
    ) into v_is_leave;

    -- Skip weekly off, holiday, leave
    if not v_is_holiday and not v_is_leave and not (v_dow = any(v_effective_weekly_off)) then
      -- Check if any accepted punches exist
      select exists(
        select 1 from public.attendance_punches
        where user_id = v_staff.id
          and (at at time zone v_tz)::date = v_check_date
          and status = 'accepted'
      ) into v_has_punch;

      if not v_has_punch then
        insert into public.attendance_days (
          user_id,
          date,
          status,
          worked_minutes,
          late_minutes,
          updated_at
        ) values (
          v_staff.id,
          v_check_date,
          'absent',
          0,
          0,
          now()
        ) on conflict (user_id, date) do update
        set
          status = 'absent',
          updated_at = now()
        where attendance_days.status in ('weekly_off', 'pending');

        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- 7. Update get_staff_leaderboard: ONLY is_sales_team = true and is_active = true
-- ============================================================================
create or replace function public.get_staff_leaderboard(
  p_start_date date,
  p_end_date date,
  p_limit integer default 10,
  p_include_test boolean default false
)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  total_revenue numeric,
  receipts_count bigint,
  students_count bigint,
  rank bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  with staff_payments as (
    select
      e.admission_staff_id as staff_id,
      coalesce(sum(p.amount), 0.00) as revenue,
      count(p.id) as receipts,
      count(distinct e.student_id) as students
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    where p.status = 'valid'
      and (p.payment_date at time zone 'Asia/Dubai')::date >= p_start_date
      and (p.payment_date at time zone 'Asia/Dubai')::date <= p_end_date
      and e.admission_staff_id is not null
    group by e.admission_staff_id
  ),
  eligible_staff as (
    select pr.id, pr.full_name, pr.avatar_url
    from public.profiles pr
    join auth.users u on u.id = pr.id
    where pr.is_active = true
      and pr.is_sales_team = true -- ONLY SALES TEAM MEMBERS
      and (
        p_include_test = true
        or (u.email not like '%@test.edubridge.local' and u.email not like '%@example.com')
      )
  )
  select
    es.id as user_id,
    es.full_name,
    es.avatar_url,
    coalesce(sp.revenue, 0.00) as total_revenue,
    coalesce(sp.receipts, 0)::bigint as receipts_count,
    coalesce(sp.students, 0)::bigint as students_count,
    dense_rank() over (
      order by coalesce(sp.revenue, 0.00) desc, coalesce(sp.students, 0) desc, es.full_name asc
    )::bigint as rank
  from eligible_staff es
  left join staff_payments sp on sp.staff_id = es.id
  order by rank asc, total_revenue desc
  limit p_limit;
end;
$$;
