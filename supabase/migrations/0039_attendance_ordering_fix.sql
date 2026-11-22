-- ============================================================================
-- Migration: 0039_attendance_ordering_fix.sql
-- Description:
-- Update punch() and recalculate_attendance_day() to use clock_timestamp()
-- and deterministic tie-breaking (order by at desc, created_at desc, id desc)
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
  v_comp record;
  v_punches record;
  v_first_in timestamptz;
  v_last_out timestamptz;
  v_worked_minutes integer := 0;
  v_open_in timestamptz := null;
  v_punch record;
  v_shift_start_ts timestamptz;
  v_late_minutes integer := 0;
  v_status text := 'present';
  v_is_holiday boolean := false;
  v_is_leave boolean := false;
  v_dow integer;
  v_has_open_session boolean := false;
  v_min_full integer := 480;
  v_min_half integer := 240;
  v_tz text := 'Asia/Dubai';
begin
  select * into v_comp from public.company_settings limit 1;
  if v_comp.attendance_timezone is not null then
    v_tz := v_comp.attendance_timezone;
  end if;
  v_min_full := round(coalesce(v_comp.attendance_min_hours_full_day, 8.00) * 60);
  v_min_half := round(coalesce(v_comp.attendance_min_hours_half_day, 4.00) * 60);

  select * into v_settings from public.staff_attendance_settings where user_id = p_user_id;
  v_dow := extract(dow from p_date)::integer;

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
  elsif v_settings.weekly_off is not null and v_dow = any(v_settings.weekly_off) then
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
      if v_settings.weekly_off is not null and v_dow = any(v_settings.weekly_off) then
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
      if v_late_minutes > 0 then
        v_status := 'late';
      else
        v_status := 'half_day';
      end if;
    end if;
  end if;

  insert into public.attendance_days (
    user_id,
    date,
    first_in,
    last_out,
    worked_minutes,
    status,
    late_minutes,
    updated_at
  ) values (
    p_user_id,
    p_date,
    v_first_in,
    v_last_out,
    coalesce(v_worked_minutes, 0),
    v_status,
    coalesce(v_late_minutes, 0),
    now()
  )
  on conflict (user_id, date) do update set
    first_in = excluded.first_in,
    last_out = excluded.last_out,
    worked_minutes = excluded.worked_minutes,
    status = case when attendance_days.regularized then attendance_days.status else excluded.status end,
    late_minutes = excluded.late_minutes,
    updated_at = now();
end;
$$;

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
  v_now timestamptz := clock_timestamp(); -- Use clock_timestamp() for monotonic accurate time
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
    insert into public.staff_attendance_settings (user_id, office_id)
    values (v_uid, (select id from public.offices where is_active = true limit 1))
    returning * into v_settings;
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
        'error', 'You already have an active punch-in session. Please punch out first.'
      );
    end if;
  elsif p_kind = 'out' then
    if v_last_punch.id is null or v_last_punch.kind != 'in' then
      return jsonb_build_object(
        'success', false,
        'error', 'No active punch-in session found. You must punch in first.'
      );
    end if;
  end if;

  -- 2. Compute Haversine distance
  if p_lat is not null and p_lng is not null then
    v_distance := public.haversine_distance(p_lat, p_lng, v_office.latitude, v_office.longitude);
  else
    v_distance := 999999;
  end if;

  v_padding := least(coalesce(p_accuracy, 0), 50.0);
  v_inside := (v_distance <= (v_office.radius_m + v_padding));

  -- 3. Network match check
  v_req_net := coalesce(v_settings.require_network_match, v_office.require_network_match, false);
  if v_req_net and v_office.allowed_public_ips is not null and cardinality(v_office.allowed_public_ips) > 0 then
    if p_client_ip is null or not (p_client_ip = any(v_office.allowed_public_ips)) then
      v_net_match := false;
    else
      v_net_match := true;
    end if;
  else
    v_net_match := true;
  end if;

  -- 4. Calculate Flags
  if coalesce(p_accuracy, 0) > 100 then
    v_flags := array_append(v_flags, 'accuracy_high');
  end if;

  if p_device_hash is not null then
    select count(*) into v_prev_device_count
    from public.attendance_punches
    where user_id = v_uid and device_hash = p_device_hash and status = 'accepted';

    if v_prev_device_count = 0 and exists(select 1 from public.attendance_punches where user_id = v_uid and status = 'accepted') then
      v_flags := array_append(v_flags, 'new_device');
    end if;
  end if;

  if v_last_punch.id is not null and v_last_punch.lat is not null and p_lat is not null then
    declare
      v_punch_dist numeric;
      v_seconds numeric;
    begin
      v_punch_dist := public.haversine_distance(v_last_punch.lat, v_last_punch.lng, p_lat, p_lng);
      v_seconds := extract(epoch from (v_now - v_last_punch.at));
      if v_seconds > 0 and v_seconds < 7200 then
        v_speed_mps := v_punch_dist / v_seconds;
        if v_speed_mps > 42.0 then
          v_flags := array_append(v_flags, 'impossible_travel');
        end if;
      end if;
    end;
  end if;

  -- 5. Status Decision
  if v_inside and v_net_match then
    v_status := 'accepted';
  elsif v_settings.allow_field_punch then
    if p_note is null or length(trim(p_note)) < 5 then
      return jsonb_build_object(
        'success', false,
        'error', 'Field punch outside geofence requires a mandatory note (at least 5 characters).'
      );
    end if;
    v_status := 'pending_approval';
  else
    v_status := 'rejected';
    if not v_inside then
      v_reason := format('You are %s m from the office (allowed radius: %s m).', round(v_distance), v_office.radius_m);
      if coalesce(p_accuracy, 0) > 80 then
        v_reason := v_reason || ' Location accuracy is low — move near a window and retry.';
      end if;
    elsif not v_net_match then
      v_reason := 'Connect to the office Wi-Fi.';
    end if;
  end if;

  -- 6. Insert Punch record
  insert into public.attendance_punches (
    user_id,
    kind,
    at,
    lat,
    lng,
    accuracy_m,
    distance_m,
    ip,
    office_id,
    inside_geofence,
    network_match,
    status,
    flags,
    note,
    device_hash,
    rejection_reason
  ) values (
    v_uid,
    p_kind,
    v_now,
    p_lat,
    p_lng,
    p_accuracy,
    v_distance,
    p_client_ip,
    v_office.id,
    v_inside,
    v_net_match,
    v_status,
    v_flags,
    p_note,
    p_device_hash,
    v_reason
  ) returning id into v_punch_id;

  -- 7. If accepted, recalculate daily record
  if v_status = 'accepted' then
    perform public.recalculate_attendance_day(v_uid, v_today);
  end if;

  -- If pending_approval, notify admins
  if v_status = 'pending_approval' then
    declare
      v_adm uuid;
    begin
      for v_adm in
        select id from public.profiles
        where role in ('admin', 'super_admin', 'owner') and is_active = true
      loop
        perform public.create_notification(
          v_adm,
          'attendance_field_punch',
          'Field Punch Pending Approval',
          format('%s submitted a field punch (%s) requiring approval: %s', v_profile.full_name, p_kind, p_note),
          '/admin/attendance',
          'attendance_punch',
          v_punch_id
        );
      end loop;
    end;
  end if;

  if v_status = 'rejected' then
    return jsonb_build_object(
      'success', false,
      'error', v_reason,
      'status', 'rejected',
      'distance_m', v_distance,
      'inside_geofence', v_inside,
      'network_match', v_net_match,
      'punch_id', v_punch_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'status', v_status,
    'punch_id', v_punch_id,
    'kind', p_kind,
    'distance_m', v_distance,
    'inside_geofence', v_inside,
    'network_match', v_net_match,
    'flags', v_flags,
    'at', v_now
  );
end;
$$;
