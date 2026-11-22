-- ============================================================================
-- Migration: 0038_attendance_geofence_leave_holidays.sql
-- Description: Comprehensive Attendance System:
-- 1. Offices & Geofencing (radius, coordinates, IP matching, map master)
-- 2. Staff Attendance Settings & Company Attendance Rules
-- 3. Holidays (UAE public holidays / office holidays)
-- 4. Attendance Punches (lat, lng, accuracy, distance, IP, flags, geofence, audit)
-- 5. Attendance Days (daily summary, worked minutes, late calculation, statuses)
-- 6. Leave Requests & Regularization Requests with Workflows & Recalculation
-- 7. Haversine & Atomic RPCs: punch, approve_field_punch, approve_leave, approve_regularization
-- 8. Daily Auto-Close & Absence Processing Routines
-- 9. Row Level Security & Notifications Integration
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. OFFICES TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  radius_m integer not null default 100 check (radius_m between 30 and 1000),
  allowed_public_ips text[] not null default '{}',
  require_network_match boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default EduBridge Main Office if none exists
insert into public.offices (name, address, latitude, longitude, radius_m, allowed_public_ips, require_network_match, is_active)
select
  'EduBridge Main Office',
  'M03, Royal House Building, Hor Al Anz East, Dubai – UAE',
  25.2769870,
  55.3345870,
  100,
  '{}'::text[],
  false,
  true
where not exists (select 1 from public.offices);

-- -----------------------------------------------------------------------------
-- 2. STAFF ATTENDANCE SETTINGS
-- -----------------------------------------------------------------------------
create table if not exists public.staff_attendance_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  shift_start time not null default '09:00:00',
  shift_end time not null default '18:00:00',
  grace_minutes integer not null default 15,
  weekly_off integer[] not null default '{0}', -- 0 = Sunday (Postgres 0 = Sunday)
  attendance_required boolean not null default true,
  allow_field_punch boolean not null default false,
  require_network_match boolean default null, -- null = inherit from office
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-provision staff_attendance_settings for existing active profiles
insert into public.staff_attendance_settings (user_id, office_id, attendance_required)
select
  p.id,
  (select id from public.offices where is_active = true limit 1),
  case when p.role in ('super_admin', 'owner') or p.is_support = true then false else true end
from public.profiles p
where not exists (
  select 1 from public.staff_attendance_settings s where s.user_id = p.id
);

-- -----------------------------------------------------------------------------
-- 3. COMPANY SETTINGS ATTENDANCE EXTENSIONS
-- -----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists attendance_timezone text not null default 'Asia/Dubai',
  add column if not exists attendance_default_weekly_off integer[] not null default '{0}',
  add column if not exists attendance_auto_close_time time not null default '23:59:00',
  add column if not exists attendance_min_hours_full_day numeric(4,2) not null default 8.00,
  add column if not exists attendance_min_hours_half_day numeric(4,2) not null default 4.00;

-- -----------------------------------------------------------------------------
-- 4. HOLIDAYS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  office_id uuid references public.offices(id) on delete cascade, -- null = all offices
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. ATTENDANCE PUNCHES TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  lat numeric(10, 7),
  lng numeric(10, 7),
  accuracy_m numeric(8, 2),
  distance_m numeric(10, 2),
  ip text,
  office_id uuid references public.offices(id) on delete set null,
  inside_geofence boolean not null default false,
  network_match boolean not null default false,
  status text not null check (status in ('accepted', 'pending_approval', 'rejected')),
  flags text[] not null default '{}',
  note text,
  device_hash text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Prevent hard deletion of attendance punches
create or replace function public.trg_prevent_attendance_punch_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Attendance punches are immutable and cannot be deleted.';
end;
$$;

drop trigger if exists prevent_attendance_punch_delete on public.attendance_punches;
create trigger prevent_attendance_punch_delete
before delete on public.attendance_punches
for each row execute function public.trg_prevent_attendance_punch_delete();

-- -----------------------------------------------------------------------------
-- 6. ATTENDANCE DAYS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  first_in timestamptz,
  last_out timestamptz,
  worked_minutes integer not null default 0,
  status text not null check (status in ('present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'weekly_off', 'missing_checkout', 'pending')),
  late_minutes integer not null default 0,
  regularized boolean not null default false,
  regularization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- -----------------------------------------------------------------------------
-- 7. LEAVE REQUESTS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('annual', 'sick', 'unpaid', 'other')),
  from_date date not null,
  to_date date not null check (to_date >= from_date),
  half_day boolean not null default false,
  reason text not null check (length(trim(reason)) >= 3),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  approver_id uuid references public.profiles(id) on delete set null,
  action_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 8. REGULARIZATION REQUESTS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.regularization_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  requested_in timestamptz not null,
  requested_out timestamptz not null check (requested_out > requested_in),
  reason text not null check (length(trim(reason)) >= 3),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  approver_id uuid references public.profiles(id) on delete set null,
  action_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 9. HAVERSINE DISTANCE FUNCTION
-- -----------------------------------------------------------------------------
create or replace function public.haversine_distance(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  r constant numeric := 6371000; -- Earth radius in meters
  dlat numeric;
  dlng numeric;
  a numeric;
  c numeric;
begin
  if lat1 is null or lng1 is null or lat2 is null or lng2 is null then
    return null;
  end if;

  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);

  a := sin(dlat / 2.0)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2.0)^2;
  -- Guard clamp against precision issues
  if a > 1.0 then a := 1.0; end if;
  if a < 0.0 then a := 0.0; end if;

  c := 2.0 * asin(sqrt(a));
  return round(r * c, 2);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. HELPER: RECOMPUTE ATTENDANCE DAY
-- -----------------------------------------------------------------------------
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
  -- Fetch company & staff settings
  select * into v_comp from public.company_settings limit 1;
  if v_comp.attendance_timezone is not null then
    v_tz := v_comp.attendance_timezone;
  end if;
  v_min_full := round(coalesce(v_comp.attendance_min_hours_full_day, 8.00) * 60);
  v_min_half := round(coalesce(v_comp.attendance_min_hours_half_day, 4.00) * 60);

  select * into v_settings from public.staff_attendance_settings where user_id = p_user_id;

  -- Day of week (0 = Sunday in Postgres extract(dow))
  v_dow := extract(dow from p_date)::integer;

  -- Check if holiday
  select exists(
    select 1 from public.holidays
    where date = p_date and (office_id is null or office_id = v_settings.office_id)
  ) into v_is_holiday;

  -- Check if approved leave
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

  -- Calculate worked minutes from accepted punches ordered by time
  for v_punch in
    select * from public.attendance_punches
    where user_id = p_user_id
      and (at at time zone v_tz)::date = p_date
      and status = 'accepted'
    order by at asc
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

  -- Calculate late minutes based on first_in and shift_start
  if v_first_in is not null and v_settings.shift_start is not null then
    -- Convert date + shift_start to timestamptz in v_tz
    v_shift_start_ts := (p_date::text || ' ' || v_settings.shift_start::text)::timestamp at time zone v_tz;
    if v_first_in > (v_shift_start_ts + (coalesce(v_settings.grace_minutes, 15) * interval '1 minute')) then
      v_late_minutes := round(extract(epoch from (v_first_in - v_shift_start_ts)) / 60.0)::integer;
    end if;
  end if;

  -- Determine status if not holiday/leave
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

  -- Upsert into attendance_days
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

-- -----------------------------------------------------------------------------
-- 11. RPC: PUNCH (IN / OUT)
-- -----------------------------------------------------------------------------
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
  v_now timestamptz := now(); -- STRICT SERVER TIMESTAMP
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

  -- Ensure staff attendance settings exist
  select * into v_settings from public.staff_attendance_settings where user_id = v_uid;
  if v_settings.user_id is null then
    insert into public.staff_attendance_settings (user_id, office_id)
    values (v_uid, (select id from public.offices where is_active = true limit 1))
    returning * into v_settings;
  end if;

  -- Resolve office
  if v_settings.office_id is not null then
    select * into v_office from public.offices where id = v_settings.office_id;
  end if;
  if v_office.id is null then
    select * into v_office from public.offices where is_active = true limit 1;
  end if;

  if v_office.id is null then
    return jsonb_build_object('success', false, 'error', 'No active office configured for attendance');
  end if;

  -- Timezone & Today's date
  select coalesce(attendance_timezone, 'Asia/Dubai') into v_tz from public.company_settings limit 1;
  v_today := (v_now at time zone v_tz)::date;

  -- 1. Check open session rules
  select * into v_last_punch
  from public.attendance_punches
  where user_id = v_uid
    and status in ('accepted', 'pending_approval')
  order by at desc
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

  -- 2. Compute Haversine distance to assigned office
  if p_lat is not null and p_lng is not null then
    v_distance := public.haversine_distance(p_lat, p_lng, v_office.latitude, v_office.longitude);
  else
    v_distance := 999999;
  end if;

  -- Accuracy padding: min(accuracy, 50m)
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

  -- 4. Calculate Flags (accuracy > 100, impossible travel, new device)
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
        if v_speed_mps > 42.0 then -- > 150 km/h
          v_flags := array_append(v_flags, 'impossible_travel');
        end if;
      end if;
    end;
  end if;

  -- 5. Acceptance / Rejection / Field Punch Decision
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

-- -----------------------------------------------------------------------------
-- 12. RPC: APPROVE / REJECT FIELD PUNCH
-- -----------------------------------------------------------------------------
create or replace function public.approve_field_punch(
  p_punch_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_punch record;
  v_punch_date date;
  v_tz text := 'Asia/Dubai';
begin
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  if v_caller_role not in ('admin', 'super_admin', 'owner') then
    return jsonb_build_object('success', false, 'error', 'Admin authorization required');
  end if;

  select * into v_punch from public.attendance_punches where id = p_punch_id;
  if v_punch.id is null then
    return jsonb_build_object('success', false, 'error', 'Punch record not found');
  end if;

  if v_punch.status != 'pending_approval' then
    return jsonb_build_object('success', false, 'error', 'Punch is not pending approval');
  end if;

  select coalesce(attendance_timezone, 'Asia/Dubai') into v_tz from public.company_settings limit 1;
  v_punch_date := (v_punch.at at time zone v_tz)::date;

  if p_action = 'approve' then
    update public.attendance_punches
    set status = 'accepted',
        reviewed_by = v_caller_id,
        reviewed_at = now()
    where id = p_punch_id;

    perform public.recalculate_attendance_day(v_punch.user_id, v_punch_date);

    perform public.create_notification(
      v_punch.user_id,
      'attendance_approved',
      'Field Punch Approved',
      format('Your field punch on %s was approved.', v_punch_date),
      '/attendance',
      'attendance_punch',
      p_punch_id
    );
  elsif p_action = 'reject' then
    update public.attendance_punches
    set status = 'rejected',
        rejection_reason = coalesce(p_reason, 'Rejected by administrator'),
        reviewed_by = v_caller_id,
        reviewed_at = now()
    where id = p_punch_id;

    perform public.create_notification(
      v_punch.user_id,
      'attendance_rejected',
      'Field Punch Rejected',
      format('Your field punch on %s was rejected: %s', v_punch_date, coalesce(p_reason, 'No reason given')),
      '/attendance',
      'attendance_punch',
      p_punch_id
    );
  else
    return jsonb_build_object('success', false, 'error', 'Invalid action: must be approve or reject');
  end if;

  return jsonb_build_object('success', true, 'status', p_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. RPC: APPROVE / REJECT LEAVE REQUEST
-- -----------------------------------------------------------------------------
create or replace function public.approve_leave_request(
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_leave record;
  v_cur_date date;
begin
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  if v_caller_role not in ('admin', 'super_admin', 'owner') then
    return jsonb_build_object('success', false, 'error', 'Admin authorization required');
  end if;

  select * into v_leave from public.leave_requests where id = p_request_id;
  if v_leave.id is null then
    return jsonb_build_object('success', false, 'error', 'Leave request not found');
  end if;

  if v_leave.status != 'requested' then
    return jsonb_build_object('success', false, 'error', 'Leave request has already been processed');
  end if;

  if p_action = 'approve' then
    update public.leave_requests
    set status = 'approved',
        approver_id = v_caller_id,
        action_reason = p_reason,
        updated_at = now()
    where id = p_request_id;

    -- Mark every date in the leave range as on_leave
    v_cur_date := v_leave.from_date;
    while v_cur_date <= v_leave.to_date loop
      insert into public.attendance_days (
        user_id,
        date,
        status,
        worked_minutes,
        late_minutes,
        updated_at
      ) values (
        v_leave.user_id,
        v_cur_date,
        'on_leave',
        0,
        0,
        now()
      )
      on conflict (user_id, date) do update set
        status = 'on_leave',
        updated_at = now();

      v_cur_date := v_cur_date + interval '1 day';
    end loop;

    perform public.create_notification(
      v_leave.user_id,
      'leave_approved',
      'Leave Request Approved',
      format('Your leave request from %s to %s was approved.', v_leave.from_date, v_leave.to_date),
      '/attendance',
      'leave_request',
      p_request_id
    );
  elsif p_action = 'reject' then
    update public.leave_requests
    set status = 'rejected',
        approver_id = v_caller_id,
        action_reason = p_reason,
        updated_at = now()
    where id = p_request_id;

    perform public.create_notification(
      v_leave.user_id,
      'leave_rejected',
      'Leave Request Rejected',
      format('Your leave request from %s to %s was rejected: %s', v_leave.from_date, v_leave.to_date, coalesce(p_reason, 'No reason provided')),
      '/attendance',
      'leave_request',
      p_request_id
    );
  else
    return jsonb_build_object('success', false, 'error', 'Invalid action: must be approve or reject');
  end if;

  return jsonb_build_object('success', true, 'status', p_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. RPC: APPROVE / REJECT REGULARIZATION REQUEST
-- -----------------------------------------------------------------------------
create or replace function public.approve_regularization(
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_reg record;
  v_worked_minutes integer;
  v_settings record;
  v_shift_start_ts timestamptz;
  v_late_minutes integer := 0;
  v_status text := 'present';
  v_tz text := 'Asia/Dubai';
  v_comp record;
  v_min_full integer := 480;
  v_min_half integer := 240;
begin
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  if v_caller_role not in ('admin', 'super_admin', 'owner') then
    return jsonb_build_object('success', false, 'error', 'Admin authorization required');
  end if;

  select * into v_reg from public.regularization_requests where id = p_request_id;
  if v_reg.id is null then
    return jsonb_build_object('success', false, 'error', 'Regularization request not found');
  end if;

  if v_reg.status != 'requested' then
    return jsonb_build_object('success', false, 'error', 'Regularization request has already been processed');
  end if;

  select * into v_comp from public.company_settings limit 1;
  v_tz := coalesce(v_comp.attendance_timezone, 'Asia/Dubai');
  v_min_full := round(coalesce(v_comp.attendance_min_hours_full_day, 8.00) * 60);
  v_min_half := round(coalesce(v_comp.attendance_min_hours_half_day, 4.00) * 60);

  if p_action = 'approve' then
    update public.regularization_requests
    set status = 'approved',
        approver_id = v_caller_id,
        action_reason = p_reason,
        updated_at = now()
    where id = p_request_id;

    -- Calculate worked minutes between requested_in and requested_out
    v_worked_minutes := round(extract(epoch from (v_reg.requested_out - v_reg.requested_in)) / 60.0)::integer;

    select * into v_settings from public.staff_attendance_settings where user_id = v_reg.user_id;
    if v_settings.shift_start is not null then
      v_shift_start_ts := (v_reg.date::text || ' ' || v_settings.shift_start::text)::timestamp at time zone v_tz;
      if v_reg.requested_in > (v_shift_start_ts + (coalesce(v_settings.grace_minutes, 15) * interval '1 minute')) then
        v_late_minutes := round(extract(epoch from (v_reg.requested_in - v_shift_start_ts)) / 60.0)::integer;
      end if;
    end if;

    if v_worked_minutes >= v_min_full then
      if v_late_minutes > 0 then
        v_status := 'late';
      else
        v_status := 'present';
      end if;
    elsif v_worked_minutes >= v_min_half then
      v_status := 'half_day';
    else
      v_status := 'half_day';
    end if;

    -- Update attendance_days and mark regularized
    insert into public.attendance_days (
      user_id,
      date,
      first_in,
      last_out,
      worked_minutes,
      status,
      late_minutes,
      regularized,
      regularization_id,
      updated_at
    ) values (
      v_reg.user_id,
      v_reg.date,
      v_reg.requested_in,
      v_reg.requested_out,
      v_worked_minutes,
      v_status,
      v_late_minutes,
      true,
      v_reg.id,
      now()
    )
    on conflict (user_id, date) do update set
      first_in = excluded.first_in,
      last_out = excluded.last_out,
      worked_minutes = excluded.worked_minutes,
      status = excluded.status,
      late_minutes = excluded.late_minutes,
      regularized = true,
      regularization_id = excluded.regularization_id,
      updated_at = now();

    -- Log in audit_log
    insert into public.audit_log (
      action,
      entity_type,
      entity_id,
      user_id,
      metadata
    ) values (
      'approve_regularization',
      'regularization_request',
      p_request_id,
      v_caller_id,
      jsonb_build_object(
        'target_user_id', v_reg.user_id,
        'date', v_reg.date,
        'worked_minutes', v_worked_minutes,
        'status', v_status
      )
    );

    perform public.create_notification(
      v_reg.user_id,
      'regularization_approved',
      'Attendance Regularization Approved',
      format('Your attendance correction for %s was approved.', v_reg.date),
      '/attendance',
      'regularization_request',
      p_request_id
    );
  elsif p_action = 'reject' then
    update public.regularization_requests
    set status = 'rejected',
        approver_id = v_caller_id,
        action_reason = p_reason,
        updated_at = now()
    where id = p_request_id;

    perform public.create_notification(
      v_reg.user_id,
      'regularization_rejected',
      'Attendance Regularization Rejected',
      format('Your attendance correction for %s was rejected: %s', v_reg.date, coalesce(p_reason, 'No reason provided')),
      '/attendance',
      'regularization_request',
      p_request_id
    );
  else
    return jsonb_build_object('success', false, 'error', 'Invalid action: must be approve or reject');
  end if;

  return jsonb_build_object('success', true, 'status', p_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- 15. DAILY CRON ROUTINES
-- -----------------------------------------------------------------------------
-- A. At auto_close_time: close open sessions, set day status to 'missing_checkout'
create or replace function public.process_daily_attendance_close()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tz text := 'Asia/Dubai';
  v_today date;
  v_closed_count integer := 0;
  v_rec record;
  v_settings record;
  v_adm record;
begin
  select coalesce(attendance_timezone, 'Asia/Dubai') into v_tz from public.company_settings limit 1;
  v_today := (now() at time zone v_tz)::date;

  for v_rec in
    select distinct ad.user_id, ad.date
    from public.attendance_days ad
    join public.attendance_punches ap on ap.user_id = ad.user_id and (ap.at at time zone v_tz)::date = ad.date
    where ad.date = v_today
      and not ad.regularized
      and (
        select p.kind from public.attendance_punches p
        where p.user_id = ad.user_id
          and (p.at at time zone v_tz)::date = ad.date
          and p.status = 'accepted'
        order by p.at desc limit 1
      ) = 'in'
  loop
    select * into v_settings from public.staff_attendance_settings where user_id = v_rec.user_id;

    -- Update day to missing_checkout, worked minutes for that session NOT counted until regularized
    update public.attendance_days
    set status = 'missing_checkout',
        updated_at = now()
    where user_id = v_rec.user_id and date = v_rec.date;

    v_closed_count := v_closed_count + 1;

    -- Notify staff
    perform public.create_notification(
      v_rec.user_id,
      'attendance_missing_checkout',
      'Missing Check-Out',
      'You did not punch out today. Your attendance has been marked as Missing Check-Out. Please submit a regularization request.',
      '/attendance',
      'attendance_day',
      null
    );

    -- Notify admins
    for v_adm in
      select id from public.profiles
      where role in ('admin', 'super_admin', 'owner') and is_active = true
    loop
      perform public.create_notification(
        v_adm.id,
        'attendance_missing_checkout_admin',
        'Staff Missing Check-Out',
        format('Staff member missed punch-out on %s.', v_rec.date),
        '/admin/attendance',
        'attendance_day',
        null
      );
    end loop;
  end loop;

  return jsonb_build_object('success', true, 'closed_sessions', v_closed_count);
end;
$$;

-- B. Next morning: mark absent for working days with no accepted punch
create or replace function public.process_daily_attendance_absences(p_target_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tz text := 'Asia/Dubai';
  v_check_date date;
  v_staff record;
  v_settings record;
  v_dow integer;
  v_is_holiday boolean;
  v_is_leave boolean;
  v_has_punch boolean;
  v_absent_count integer := 0;
  v_late_count integer := 0;
  v_missing_co_count integer := 0;
  v_adm record;
begin
  select coalesce(attendance_timezone, 'Asia/Dubai') into v_tz from public.company_settings limit 1;
  v_check_date := coalesce(p_target_date, (now() at time zone v_tz)::date - interval '1 day');
  v_dow := extract(dow from v_check_date)::integer;

  for v_staff in
    select p.id, p.full_name
    from public.profiles p
    join public.staff_attendance_settings sas on sas.user_id = p.id
    where p.is_active = true and sas.attendance_required = true
  loop
    select * into v_settings from public.staff_attendance_settings where user_id = v_staff.id;

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
    if not v_is_holiday and not v_is_leave and not (v_settings.weekly_off is not null and v_dow = any(v_settings.weekly_off)) then
      -- Check if any accepted punches exist
      select exists(
        select 1 from public.attendance_punches
        where user_id = v_staff.id
          and (at at time zone v_tz)::date = v_check_date
          and status = 'accepted'
      ) into v_has_punch;

      if not v_has_punch then
        -- Mark as absent
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
        )
        on conflict (user_id, date) do update set
          status = case when attendance_days.regularized then attendance_days.status else 'absent' end,
          updated_at = now();

        v_absent_count := v_absent_count + 1;

        -- Notify staff
        perform public.create_notification(
          v_staff.id,
          'attendance_absent',
          'Marked Absent',
          format('You were marked absent for %s as no punch was recorded.', v_check_date),
          '/attendance',
          'attendance_day',
          null
        );
      end if;
    end if;
  end loop;

  -- Count late and missing checkout for summary
  select count(*) into v_late_count
  from public.attendance_days
  where date = v_check_date and status = 'late';

  select count(*) into v_missing_co_count
  from public.attendance_days
  where date = v_check_date and status = 'missing_checkout';

  -- Send daily summary to admins
  for v_adm in
    select id from public.profiles
    where role in ('admin', 'super_admin', 'owner') and is_active = true
  loop
    perform public.create_notification(
      v_adm.id,
      'attendance_daily_summary',
      format('Attendance Summary for %s', v_check_date),
      format('%s absent, %s late, %s missing check-out.', v_absent_count, v_late_count, v_missing_co_count),
      '/admin/attendance',
      'attendance_summary',
      null
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'date', v_check_date,
    'absent_count', v_absent_count,
    'late_count', v_late_count,
    'missing_checkout_count', v_missing_co_count
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
alter table public.offices enable row level security;
alter table public.staff_attendance_settings enable row level security;
alter table public.holidays enable row level security;
alter table public.attendance_punches enable row level security;
alter table public.attendance_days enable row level security;
alter table public.leave_requests enable row level security;
alter table public.regularization_requests enable row level security;

-- Offices RLS
drop policy if exists "offices_select" on public.offices;
create policy "offices_select" on public.offices
for select to authenticated
using (true);

drop policy if exists "offices_manage" on public.offices;
create policy "offices_manage" on public.offices
for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin', 'owner')
  )
);

-- Staff Attendance Settings RLS
drop policy if exists "staff_attendance_settings_select" on public.staff_attendance_settings;
create policy "staff_attendance_settings_select" on public.staff_attendance_settings
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin', 'owner')
  )
);

drop policy if exists "staff_attendance_settings_modify" on public.staff_attendance_settings;
create policy "staff_attendance_settings_modify" on public.staff_attendance_settings
for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and (
      role in ('super_admin', 'owner')
      or (role = 'admin' and user_id in (select user_id from public.visible_user_ids()))
    )
  )
);

-- Holidays RLS
drop policy if exists "holidays_select" on public.holidays;
create policy "holidays_select" on public.holidays
for select to authenticated
using (true);

drop policy if exists "holidays_manage" on public.holidays;
create policy "holidays_manage" on public.holidays
for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin', 'owner')
  )
);

-- Attendance Punches RLS (Location strictly visible to self and admins in scope)
drop policy if exists "punches_select" on public.attendance_punches;
create policy "punches_select" on public.attendance_punches
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and (
      role in ('super_admin', 'owner')
      or (role = 'admin' and user_id in (select user_id from public.visible_user_ids()))
    )
  )
);

-- Attendance Days RLS
drop policy if exists "attendance_days_select" on public.attendance_days;
create policy "attendance_days_select" on public.attendance_days
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and (
      role in ('super_admin', 'owner')
      or (role = 'admin' and user_id in (select user_id from public.visible_user_ids()))
    )
  )
);

-- Leave Requests RLS
drop policy if exists "leave_requests_select" on public.leave_requests;
create policy "leave_requests_select" on public.leave_requests
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and (
      role in ('super_admin', 'owner')
      or (role = 'admin' and user_id in (select user_id from public.visible_user_ids()))
    )
  )
);

drop policy if exists "leave_requests_insert" on public.leave_requests;
create policy "leave_requests_insert" on public.leave_requests
for insert to authenticated
with check (user_id = auth.uid());

-- Regularization Requests RLS
drop policy if exists "regularization_requests_select" on public.regularization_requests;
create policy "regularization_requests_select" on public.regularization_requests
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and (
      role in ('super_admin', 'owner')
      or (role = 'admin' and user_id in (select user_id from public.visible_user_ids()))
    )
  )
);

drop policy if exists "regularization_requests_insert" on public.regularization_requests;
create policy "regularization_requests_insert" on public.regularization_requests
for insert to authenticated
with check (user_id = auth.uid());
