-- Migration: 0063_fix_punch_return_format.sql
-- Description: Align punch() return object with error property on rejection

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
      v_flags := array_append(v_flags, 'network_mismatch');
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
    rejection_reason,
    note,
    device_hash,
    flags
  ) values (
    v_uid,
    p_kind,
    v_now,
    p_lat,
    p_lng,
    p_accuracy,
    round(v_distance, 2),
    p_client_ip,
    v_office.id,
    v_inside,
    v_net_match,
    v_status,
    v_reason,
    p_note,
    p_device_hash,
    v_flags
  ) returning id into v_punch_id;

  -- 7. Trigger asynchronous daily sheet recalculation
  if v_status in ('accepted', 'pending_approval') then
    perform public.recalculate_attendance_day(v_uid, v_today);
  end if;

  if v_status = 'rejected' then
    return jsonb_build_object(
      'success', false,
      'error', v_reason,
      'status', 'rejected',
      'distance_m', round(v_distance, 1),
      'inside_geofence', v_inside,
      'network_match', v_net_match,
      'rejection_reason', v_reason,
      'punch_id', v_punch_id,
      'flags', v_flags
    );
  end if;

  return jsonb_build_object(
    'success', (v_status in ('accepted', 'pending_approval')),
    'status', v_status,
    'punch_id', v_punch_id,
    'distance_m', round(v_distance, 1),
    'inside_geofence', v_inside,
    'network_match', v_net_match,
    'rejection_reason', v_reason,
    'flags', v_flags
  );
end;
$$;
