-- =============================================================================
-- Attendance Roles, Sales Team, and Work Calendar Proof Tests
-- =============================================================================
begin;

create temp table test_output (test text, result text);
grant all on test_output to authenticated, anon;

-- Setup test IDs
-- Super admin user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-aaaa-bbbb-cccc-111111111111'::uuid, 'proof_super_admin@test.edubridge.local', '', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, full_name, role, is_active, is_sales_team)
values ('11111111-aaaa-bbbb-cccc-111111111111'::uuid, 'Proof Super Admin', 'super_admin', true, false)
on conflict (id) do update set role = 'super_admin', is_sales_team = false, is_active = true;

-- Staff user (non-sales)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('22222222-aaaa-bbbb-cccc-222222222222'::uuid, 'proof_staff_user@test.edubridge.local', '', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, full_name, role, is_active, is_sales_team)
values ('22222222-aaaa-bbbb-cccc-222222222222'::uuid, 'Proof Staff User', 'staff', true, false)
on conflict (id) do update set role = 'staff', is_sales_team = false, is_active = true;

-- Sales staff user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('33333333-aaaa-bbbb-cccc-333333333333'::uuid, 'proof_sales_staff@test.edubridge.local', '', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, full_name, role, is_active, is_sales_team)
values ('33333333-aaaa-bbbb-cccc-333333333333'::uuid, 'Proof Sales Staff', 'staff', true, true)
on conflict (id) do update set role = 'staff', is_sales_team = true, is_active = true;

-- Team admin user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('44444444-aaaa-bbbb-cccc-444444444444'::uuid, 'proof_admin_user@test.edubridge.local', '', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, full_name, role, is_active, is_sales_team)
values ('44444444-aaaa-bbbb-cccc-444444444444'::uuid, 'Proof Admin User', 'admin', true, false)
on conflict (id) do update set role = 'admin', is_sales_team = false, is_active = true;

-- Office setup for geofence
insert into offices (id, name, address, latitude, longitude, radius_m, is_active)
values ('55555555-aaaa-bbbb-cccc-555555555555'::uuid, 'Proof Test Office', 'Dubai Test Address', 25.2048, 55.2708, 1000, true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- TEST 1: Super admin punch is rejected by default (attendance_required = false)
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-aaaa-bbbb-cccc-111111111111","role":"authenticated"}';

do $$
declare
  v_res jsonb;
begin
  select punch(
    p_kind := 'in',
    p_lat := 25.2048,
    p_lng := 55.2708,
    p_accuracy := 10
  ) into v_res;

  if (v_res->>'success')::boolean = false and (v_res->>'error') like '%Attendance is not required for super_admin accounts%' then
    insert into test_output values ('test_1_super_admin_punch_default', 'PASS: ' || (v_res->>'error'));
  else
    insert into test_output values ('test_1_super_admin_punch_default', 'FAIL: unexpected punch response: ' || coalesce(v_res::text, 'null'));
  end if;
exception when others then
  if sqlerrm like '%Attendance is not required for super_admin accounts%' then
    insert into test_output values ('test_1_super_admin_punch_default', 'PASS: ' || sqlerrm);
  else
    insert into test_output values ('test_1_super_admin_punch_default', 'FAIL unexpected: ' || sqlerrm);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- TEST 2: Staff cannot modify is_sales_team on themselves
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-aaaa-bbbb-cccc-222222222222","role":"authenticated"}';

do $$
begin
  update profiles set is_sales_team = true where id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid;
  insert into test_output values ('test_2_staff_self_modify_sales_flag', 'FAIL: staff modified is_sales_team');
exception when others then
  if sqlerrm like '%Staff members cannot modify administrative employment fields%' or sqlerrm like '%Only administrators can modify%' or sqlerrm like '%only Super Admins and authorized Admins can modify user profiles%' then
    insert into test_output values ('test_2_staff_self_modify_sales_flag', 'PASS: ' || sqlerrm);
  else
    insert into test_output values ('test_2_staff_self_modify_sales_flag', 'FAIL unexpected: ' || sqlerrm);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- TEST 3: Super admin CAN modify is_sales_team
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-aaaa-bbbb-cccc-111111111111","role":"authenticated"}';

do $$
begin
  update profiles set is_sales_team = true where id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid;
  insert into test_output values ('test_3_super_admin_modify_sales_flag', 'PASS: super_admin successfully updated is_sales_team');
exception when others then
  insert into test_output values ('test_3_super_admin_modify_sales_flag', 'FAIL: ' || sqlerrm);
end;
$$;

-- Reset staff back to non-sales
update profiles set is_sales_team = false where id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid;

-- -----------------------------------------------------------------------------
-- TEST 4: Leaderboard RPC includes ONLY is_sales_team = true
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-aaaa-bbbb-cccc-111111111111","role":"authenticated"}';

do $$
declare
  v_count_non_sales int;
  v_count_sales int;
begin
  -- Query get_staff_leaderboard with p_include_test := true
  select count(*) into v_count_non_sales
  from get_staff_leaderboard(
    p_period := 'this_month',
    p_metric := 'collections',
    p_include_test := true
  )
  where user_id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid;

  select count(*) into v_count_sales
  from get_staff_leaderboard(
    p_period := 'this_month',
    p_metric := 'collections',
    p_include_test := true
  )
  where user_id = '33333333-aaaa-bbbb-cccc-333333333333'::uuid;

  if v_count_non_sales = 0 and v_count_sales = 1 then
    insert into test_output values ('test_4_leaderboard_sales_filter', 'PASS: only is_sales_team=true appears in leaderboard');
  else
    insert into test_output values ('test_4_leaderboard_sales_filter', format('FAIL: non_sales count=%s, sales count=%s', v_count_non_sales, v_count_sales));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- TEST 5: Fallback to company default weekly-off when user has no config
-- -----------------------------------------------------------------------------
do $$
declare
  v_default_off int[];
  v_status text;
begin
  -- Ensure company setting has attendance_default_weekly_off = [5] (Friday)
  update company_settings set attendance_default_weekly_off = array[5] where singleton = true;

  -- Remove any personal attendance settings for staff user
  delete from staff_attendance_settings where user_id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid;

  -- Test recalculate_attendance_day on a Friday (e.g. 2026-11-27 is Friday, DOW=5)
  perform recalculate_attendance_day('22222222-aaaa-bbbb-cccc-222222222222'::uuid, '2026-11-27'::date);

  select status into v_status from attendance_days
  where user_id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid and date = '2026-11-27'::date;

  if v_status = 'weekly_off' then
    insert into test_output values ('test_5_weekly_off_company_default', 'PASS: unconfigured user gets company default weekly_off on Friday');
  else
    insert into test_output values ('test_5_weekly_off_company_default', format('FAIL: expected weekly_off, got %s', coalesce(v_status, 'null')));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- TEST 6: Public holiday is marked as 'holiday' (not absent)
-- -----------------------------------------------------------------------------
do $$
declare
  v_status text;
begin
  -- Insert a holiday on a working day (e.g. Thursday 2026-11-26)
  insert into holidays (id, date, name)
  values ('66666666-aaaa-bbbb-cccc-666666666666'::uuid, '2026-11-26'::date, 'Proof Test Holiday')
  on conflict (id) do update set date = '2026-11-26'::date;

  perform recalculate_attendance_day('22222222-aaaa-bbbb-cccc-222222222222'::uuid, '2026-11-26'::date);

  select status into v_status from attendance_days
  where user_id = '22222222-aaaa-bbbb-cccc-222222222222'::uuid and date = '2026-11-26'::date;

  if v_status = 'holiday' then
    insert into test_output values ('test_6_holiday_not_absent', 'PASS: holiday correctly recognized and not marked absent');
  else
    insert into test_output values ('test_6_holiday_not_absent', format('FAIL: expected holiday, got %s', coalesce(v_status, 'null')));
  end if;
end;
$$;

reset role;
select * from test_output order by test;

rollback;
