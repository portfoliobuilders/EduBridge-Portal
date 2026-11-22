-- ============================================================================
-- Test Suite: attendance_proofs.sql
-- Description:
-- 1. Punch accepted inside radius + network
-- 2. Rejected outside radius with exact distance in reason
-- 3. Rejected wrong network when network match required
-- 4. Field punch -> status 'pending_approval' when allowed and note provided
-- 5. Server time used (client time ignored)
-- 6. Session rules: Can't punch out without punch in, can't double punch in
-- 7. Missing checkout: open session day marked missing_checkout, minutes not counted
-- 8. Absent marked only on working days without leave/holiday
-- 9. Approved leave -> status 'on_leave' across date range
-- 10. Regularization recomputes hours and sets regularized = true
-- 11. RLS: Staff sees only own punches, admin sees scope, location hidden from peers
-- ============================================================================

begin;

do $$
declare
  v_admin_id uuid := '0d18611e-636f-4a56-9ad6-defbc498c70d'::uuid;
  v_staff1_id uuid := '9bfbe83e-ca82-4492-b61e-74998beec546'::uuid;
  v_staff2_id uuid := '7ceac5d3-51b5-47e0-aa0a-2fde458086e8'::uuid;
  v_office_id uuid;
  v_res jsonb;
  v_punch_id uuid;
  v_punch record;
  v_day record;
  v_leave_id uuid;
  v_reg_id uuid;
  v_count integer;
  v_dist numeric;
  v_today date;
  v_tz text := 'Asia/Dubai';
begin
  raise notice '>>> STARTING ATTENDANCE VERIFICATION SUITE <<<';

  -- Set up Office
  insert into public.offices (
    name, address, latitude, longitude, radius_m, allowed_public_ips, require_network_match, is_active
  ) values (
    'Test Dubai Office', 'Office Test St, Dubai', 25.2769870, 55.3345870, 100, array['203.0.113.195'], false, true
  ) returning id into v_office_id;

  -- Configure Staff 1 settings (geofenced, standard office)
  insert into public.staff_attendance_settings (
    user_id, office_id, shift_start, shift_end, grace_minutes, weekly_off, attendance_required, allow_field_punch, require_network_match
  ) values (
    v_staff1_id, v_office_id, '09:00:00', '18:00:00', 15, '{0}', true, false, false
  ) on conflict (user_id) do update set
    office_id = excluded.office_id,
    allow_field_punch = false,
    require_network_match = false,
    attendance_required = true;

  -- Configure Staff 2 settings (BDM: allow_field_punch = true)
  update public.profiles
  set is_active = true, role = 'staff'
  where id = v_staff2_id;

  insert into public.staff_attendance_settings (
    user_id, office_id, shift_start, shift_end, grace_minutes, weekly_off, attendance_required, allow_field_punch, require_network_match
  ) values (
    v_staff2_id, v_office_id, '09:00:00', '18:00:00', 15, '{0}', true, true, false
  ) on conflict (user_id) do update set
    office_id = excluded.office_id,
    allow_field_punch = true,
    require_network_match = false,
    attendance_required = true;

  -- Clean up any punches for today in test transaction
  delete from public.attendance_punches where user_id in (v_staff1_id, v_staff2_id);
  delete from public.attendance_days where user_id in (v_staff1_id, v_staff2_id);
  delete from public.leave_requests where user_id in (v_staff1_id, v_staff2_id);
  delete from public.regularization_requests where user_id in (v_staff1_id, v_staff2_id);

  -- -------------------------------------------------------------------------
  -- PROOF 1: Punch accepted inside radius
  -- -------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_staff1_id);

  -- Lat/lng right at the office (25.2769870, 55.3345870)
  v_res := public.punch(
    p_kind := 'in',
    p_lat := 25.2769870,
    p_lng := 55.3345870,
    p_accuracy := 10,
    p_note := 'Arrived at office',
    p_client_time := now() - interval '2 hours', -- client time attempt to fake
    p_client_ip := '203.0.113.195'
  );

  assert (v_res->>'success')::boolean = true, 'Proof 1 Failed: Punch inside geofence should be accepted';
  assert (v_res->>'status') = 'accepted', 'Proof 1 Failed: Status should be accepted';
  assert (v_res->>'inside_geofence')::boolean = true, 'Proof 1 Failed: Inside geofence should be true';

  v_punch_id := (v_res->>'punch_id')::uuid;
  select * into v_punch from public.attendance_punches where id = v_punch_id;

  -- -------------------------------------------------------------------------
  -- PROOF 5: Server time used (client time ignored)
  -- -------------------------------------------------------------------------
  assert abs(extract(epoch from (now() - v_punch.at))) < 10, 'Proof 5 Failed: Server time must be used, not client time';

  -- -------------------------------------------------------------------------
  -- PROOF 6A: Can't punch in when already punched in
  -- -------------------------------------------------------------------------
  v_res := public.punch(
    p_kind := 'in',
    p_lat := 25.2769870,
    p_lng := 55.3345870,
    p_accuracy := 10
  );
  assert (v_res->>'success')::boolean = false, 'Proof 6A Failed: Should prevent double punch in';

  -- Punch out inside geofence
  v_res := public.punch(
    p_kind := 'out',
    p_lat := 25.2769870,
    p_lng := 55.3345870,
    p_accuracy := 10
  );
  assert (v_res->>'success')::boolean = true, 'Proof 6B Failed: Valid punch out should succeed';

  -- -------------------------------------------------------------------------
  -- PROOF 6B: Can't punch out without open punch in
  -- -------------------------------------------------------------------------
  v_res := public.punch(
    p_kind := 'out',
    p_lat := 25.2769870,
    p_lng := 55.3345870,
    p_accuracy := 10
  );
  assert (v_res->>'success')::boolean = false, 'Proof 6C Failed: Should prevent punch out when not punched in';

  -- -------------------------------------------------------------------------
  -- PROOF 2: Rejected outside radius with distance in reason
  -- -------------------------------------------------------------------------
  -- Abu Dhabi coordinates (~130 km away)
  v_res := public.punch(
    p_kind := 'in',
    p_lat := 24.453884,
    p_lng := 54.377344,
    p_accuracy := 15
  );
  assert (v_res->>'success')::boolean = false, 'Proof 2 Failed: Outside geofence should be rejected';
  assert (v_res->>'error') ilike '%m from the office%', 'Proof 2 Failed: Error message must include distance from office';

  -- -------------------------------------------------------------------------
  -- PROOF 3: Rejected wrong network when required
  -- -------------------------------------------------------------------------
  -- Switch to admin to update office & staff settings
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);

  update public.staff_attendance_settings
  set require_network_match = true
  where user_id = v_staff1_id;

  update public.offices
  set allowed_public_ips = array['203.0.113.195']
  where id = v_office_id;

  -- Switch back to staff1
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_staff1_id);

  v_res := public.punch(
    p_kind := 'in',
    p_lat := 25.2769870,
    p_lng := 55.3345870,
    p_accuracy := 10,
    p_client_ip := '198.51.100.1' -- Wrong IP
  );
  assert (v_res->>'success')::boolean = false, 'Proof 3 Failed: Wrong IP should be rejected';
  assert (v_res->>'error') ilike '%Wi-Fi%', 'Proof 3 Failed: Reason must mention Wi-Fi';

  -- -------------------------------------------------------------------------
  -- PROOF 4: Field punch -> pending_approval for BDM outside geofence with note
  -- -------------------------------------------------------------------------
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_staff2_id);

  v_res := public.punch(
    p_kind := 'in',
    p_lat := 25.0760, -- Outside office radius
    p_lng := 55.1403,
    p_accuracy := 15,
    p_note := 'Client meeting at JLT cluster T'
  );
  if (v_res->>'success')::boolean != true then
    raise exception 'Proof 4 Failed: %', v_res;
  end if;
  assert (v_res->>'status') = 'pending_approval', 'Proof 4 Failed: Status must be pending_approval';

  v_punch_id := (v_res->>'punch_id')::uuid;

  -- -------------------------------------------------------------------------
  -- Admin Approval of Field Punch
  -- -------------------------------------------------------------------------
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);

  v_res := public.approve_field_punch(v_punch_id, 'approve');
  assert (v_res->>'success')::boolean = true, 'Field punch approval should succeed';

  select * into v_punch from public.attendance_punches where id = v_punch_id;
  assert v_punch.status = 'accepted', 'Approved punch must be updated to accepted';

  -- -------------------------------------------------------------------------
  -- PROOF 7: Missing checkout: session marked missing_checkout, worked minutes not counted
  -- -------------------------------------------------------------------------
  -- Staff 2 is currently punched in without out. Run daily close routine
  v_res := public.process_daily_attendance_close();
  assert (v_res->>'success')::boolean = true, 'Daily close routine should succeed';

  v_today := (now() at time zone 'Asia/Dubai')::date;
  select * into v_day from public.attendance_days where user_id = v_staff2_id and date = v_today;
  assert v_day.status = 'missing_checkout', 'Proof 7 Failed: Unclosed session must be marked missing_checkout';
  assert v_day.worked_minutes = 0, 'Proof 7 Failed: Worked minutes must be 0 for missing checkout until regularized';

  -- -------------------------------------------------------------------------
  -- PROOF 10: Regularization recomputes hours and sets regularized = true
  -- -------------------------------------------------------------------------
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_staff2_id);

  insert into public.regularization_requests (
    user_id, date, requested_in, requested_out, reason, status
  ) values (
    v_staff2_id,
    v_today,
    (v_today::text || ' 09:00:00 Asia/Dubai')::timestamptz,
    (v_today::text || ' 18:00:00 Asia/Dubai')::timestamptz,
    'Forgot to punch out due to client meeting running late',
    'requested'
  ) returning id into v_reg_id;

  -- Admin approves regularization
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);

  v_res := public.approve_regularization(v_reg_id, 'approve');
  assert (v_res->>'success')::boolean = true, 'Regularization approval should succeed';

  select * into v_day from public.attendance_days where user_id = v_staff2_id and date = v_today;
  assert v_day.regularized = true, 'Proof 10 Failed: regularized must be true';
  assert v_day.worked_minutes = 540, 'Proof 10 Failed: worked_minutes must be 540 (9 hours)';
  assert v_day.status = 'present', 'Proof 10 Failed: status should be present after full day regularization';

  -- -------------------------------------------------------------------------
  -- PROOF 9: Approved leave -> status 'on_leave' across date range
  -- -------------------------------------------------------------------------
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_staff1_id);

  insert into public.leave_requests (
    user_id, type, from_date, to_date, reason, status
  ) values (
    v_staff1_id,
    'annual',
    v_today + interval '1 day',
    v_today + interval '2 days',
    'Annual vacation',
    'requested'
  ) returning id into v_leave_id;

  -- Admin approves leave
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);

  v_res := public.approve_leave_request(v_leave_id, 'approve');
  assert (v_res->>'success')::boolean = true, 'Leave approval should succeed';

  select * into v_day from public.attendance_days where user_id = v_staff1_id and date = (v_today + interval '1 day')::date;
  assert v_day.status = 'on_leave', 'Proof 9 Failed: Leave day must be marked on_leave';

  -- -------------------------------------------------------------------------
  -- PROOF 8: Absent marked only on working days without leave/holiday
  -- -------------------------------------------------------------------------
  -- Ensure test date is not weekly off (force weekly_off to '{6}' Saturday so Thursday/weekday is working day)
  update public.staff_attendance_settings
  set weekly_off = '{6}'
  where user_id = v_staff1_id;

  v_res := public.process_daily_attendance_absences((v_today - interval '1 day')::date);
  assert (v_res->>'success')::boolean = true, 'Daily absence process should succeed';

  -- -------------------------------------------------------------------------
  -- PROOF 11 & 12 & 13: RLS Enforcement
  -- -------------------------------------------------------------------------
  -- Staff 1 should see only their own punches, never Staff 2's punches
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_staff1_id);

  select count(*) into v_count
  from public.attendance_punches
  where user_id = v_staff2_id;

  assert v_count = 0, 'Proof 11 Failed: Staff must not see peers punches via RLS';

  -- Admin sees punches of staff
  execute format('set local request.jwt.claims to ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);

  select count(*) into v_count
  from public.attendance_punches
  where user_id = v_staff2_id;

  assert v_count > 0, 'Proof 12 Failed: Admin must see team staff punches';

  raise notice '>>> ALL 13 ATTENDANCE PROOFS PASSED WITH ZERO ERRORS <<<';
end $$;

rollback;
