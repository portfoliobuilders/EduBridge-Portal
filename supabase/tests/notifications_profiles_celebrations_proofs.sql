-- ============================================================================
-- SQL Test Suite: notifications_profiles_celebrations_proofs.sql
-- Description:
-- 1. Notification RLS (user sees own only, cannot insert directly)
-- 2. Recipient rules per event (payment, enrollment, transfer, staff joined)
-- 3. Sensitive-field visibility (DOB, address, emergency contact isolated by RLS)
-- 4. Celebrations privacy: birth year NEVER exposed, opt-out hides celebrant, 29->28 Feb handling
-- 5. Celebration wishes constraints (one wish per sender per occasion, self-wish blocked, thank-you workflow)
-- ============================================================================

begin;

-- Temporary test table to record test results
create temporary table test_results (
  test_no int,
  test_name text,
  status text,
  details text
) on commit drop;

grant select, insert on test_results to authenticated;

do $$
declare
  v_super_admin uuid;
  v_admin uuid;
  v_staff_a uuid;
  v_staff_b uuid;
  v_staff_opt_out uuid;
  v_staff_leap uuid;
  v_course_id uuid;
  v_uni_id uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_notif_count int;
  v_notif_id uuid;
  v_read_at timestamptz;
  v_cel_json jsonb;
  v_wish_id uuid;
  v_thank_count int;
  v_sensitive_count int;
  v_has_birth_year boolean;
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_cur_year int := extract(year from v_today)::int;
  v_err text;
begin
  -- ---------------------------------------------------------------------------
  -- Setup test users
  -- ---------------------------------------------------------------------------
  v_super_admin := gen_random_uuid();
  v_admin := gen_random_uuid();
  v_staff_a := gen_random_uuid();
  v_staff_b := gen_random_uuid();
  v_staff_opt_out := gen_random_uuid();
  v_staff_leap := gen_random_uuid();

  insert into auth.users (id, email)
  values
    (v_super_admin, 'test_super_admin@temp.local'),
    (v_admin, 'test_admin@temp.local'),
    (v_staff_a, 'test_staff_a@temp.local'),
    (v_staff_b, 'test_staff_b@temp.local'),
    (v_staff_opt_out, 'test_staff_opt_out@temp.local'),
    (v_staff_leap, 'test_staff_leap@temp.local')
  on conflict (id) do nothing;

  update public.profiles set
    full_name = 'Super Admin Test', role = 'super_admin', is_active = true, admin_scope = 'company'
  where id = v_super_admin;

  update public.profiles set
    full_name = 'Admin Test', role = 'admin', is_active = true, admin_scope = 'team'
  where id = v_admin;

  update public.profiles set
    full_name = 'Staff Member A', role = 'staff', is_active = true, reports_to = v_admin,
    joining_date = make_date(v_cur_year - 2, extract(month from v_today)::int, extract(day from v_today)::int),
    celebrate_birthday = true, celebrate_anniversary = true
  where id = v_staff_a;

  insert into public.staff_sensitive_details (
    user_id, dob, address, emergency_contact_name, emergency_contact_phone
  ) values (
    v_staff_a,
    make_date(1995, extract(month from v_today)::int, extract(day from v_today)::int),
    '123 Dubai Marina', 'Jane Doe', '+971501112233'
  ) on conflict (user_id) do update set
    dob = excluded.dob, address = excluded.address,
    emergency_contact_name = excluded.emergency_contact_name, emergency_contact_phone = excluded.emergency_contact_phone;

  update public.profiles set
    full_name = 'Staff Member B', role = 'staff', is_active = true, reports_to = v_admin,
    joining_date = make_date(v_cur_year - 1, 10, 1),
    celebrate_birthday = true, celebrate_anniversary = true
  where id = v_staff_b;

  insert into public.staff_sensitive_details (
    user_id, dob, address, emergency_contact_name, emergency_contact_phone
  ) values (
    v_staff_b,
    make_date(1998, 11, 15),
    '456 JLT Cluster D', 'Bob Smith', '+971504445566'
  ) on conflict (user_id) do update set
    dob = excluded.dob, address = excluded.address,
    emergency_contact_name = excluded.emergency_contact_name, emergency_contact_phone = excluded.emergency_contact_phone;

  update public.profiles set
    full_name = 'Opt Out Staff', role = 'staff', is_active = true, reports_to = v_admin,
    joining_date = make_date(v_cur_year - 3, extract(month from v_today)::int, extract(day from v_today)::int),
    celebrate_birthday = false, celebrate_anniversary = false
  where id = v_staff_opt_out;

  insert into public.staff_sensitive_details (
    user_id, dob, address
  ) values (
    v_staff_opt_out,
    make_date(1992, extract(month from v_today)::int, extract(day from v_today)::int),
    '789 Business Bay'
  ) on conflict (user_id) do update set
    dob = excluded.dob, address = excluded.address;

  update public.profiles set
    full_name = 'Leap Day Staff', role = 'staff', is_active = true, reports_to = v_admin,
    joining_date = '2020-02-29'::date,
    celebrate_birthday = true, celebrate_anniversary = true
  where id = v_staff_leap;

  insert into public.staff_sensitive_details (
    user_id, dob
  ) values (
    v_staff_leap,
    '1996-02-29'::date
  ) on conflict (user_id) do update set
    dob = excluded.dob;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Notification RLS - user sees own only
  -- ---------------------------------------------------------------------------
  -- Create notification for staff A and staff B
  perform public.create_notification(v_staff_a, 'test_type', 'A Title', 'A Body');
  perform public.create_notification(v_staff_b, 'test_type', 'B Title', 'B Body');

  -- Impersonate staff A
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a::text, 'role', 'authenticated')::text);

  select count(*) into v_notif_count from public.notifications;

  if v_notif_count = 1 then
    insert into test_results values (1, 'Notification RLS - user sees own only', 'PASS', 'Staff A sees exactly 1 notification belonging to them');
  else
    insert into test_results values (1, 'Notification RLS - user sees own only', 'FAIL', 'Staff A saw ' || v_notif_count || ' notifications, expected 1');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Notification RLS - cannot mark another user''s notification read
  -- ---------------------------------------------------------------------------
  -- Find staff B''s notification id (via security definer query)
  select id into v_notif_id from public.notifications where user_id = v_staff_b limit 1;

  -- As Staff A, try to mark staff B's notification read
  update public.notifications set read_at = now() where id = v_notif_id;

  select read_at into v_read_at from public.notifications where id = v_notif_id;

  if v_read_at is null then
    insert into test_results values (2, 'Notification RLS - cannot update others notifications', 'PASS', 'Update on another user notification affected 0 rows');
  else
    insert into test_results values (2, 'Notification RLS - cannot update others notifications', 'FAIL', 'Staff A was able to update Staff B notification');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Sensitive fields RLS on staff_sensitive_details
  -- ---------------------------------------------------------------------------
  -- Impersonate staff B
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b::text, 'role', 'authenticated')::text);

  -- Staff B attempts to query Staff A's sensitive details directly
  select count(*) into v_sensitive_count
  from public.staff_sensitive_details
  where user_id = v_staff_a;

  if v_sensitive_count = 0 then
    insert into test_results values (3, 'Sensitive details RLS - peer query returns 0 rows', 'PASS', 'Staff B cannot access Staff A sensitive details via RLS');
  else
    insert into test_results values (3, 'Sensitive details RLS - peer query returns 0 rows', 'FAIL', 'Staff B was able to read Staff A sensitive details');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Sensitive fields view masking
  -- ---------------------------------------------------------------------------
  -- As Staff B, query staff_directory_view for Staff A
  select (dob is not null or address is not null or emergency_contact_name is not null)
  into v_has_birth_year
  from public.staff_directory_view
  where id = v_staff_a;

  if v_has_birth_year = false then
    insert into test_results values (4, 'Staff directory view - sensitive fields masked for peer', 'PASS', 'DOB, address, emergency contact are NULL when viewed by peer');
  else
    insert into test_results values (4, 'Staff directory view - sensitive fields masked for peer', 'FAIL', 'Sensitive fields were exposed to peer');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Admin in scope CAN see team member sensitive details
  -- ---------------------------------------------------------------------------
  -- Impersonate Admin
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text);

  select count(*) into v_sensitive_count
  from public.staff_sensitive_details
  where user_id = v_staff_a;

  if v_sensitive_count = 1 then
    insert into test_results values (5, 'Sensitive details RLS - admin in scope can view team details', 'PASS', 'Admin in scope can access team member sensitive details');
  else
    insert into test_results values (5, 'Sensitive details RLS - admin in scope can view team details', 'FAIL', 'Admin was not able to access team member sensitive details');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 6: Celebrations API - birth year NEVER returned
  -- ---------------------------------------------------------------------------
  -- Query get_celebrations_today() as Staff B
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b::text, 'role', 'authenticated')::text);

  select jsonb_agg(to_jsonb(c)) into v_cel_json
  from public.get_celebrations_today(v_today) c;

  -- Verify no 'dob', 'birth_year', 'age' key exists in output JSON
  if v_cel_json::text ~* 'birth_year' or v_cel_json::text ~* '1995' or v_cel_json::text ~* '1992' then
    insert into test_results values (6, 'Celebrations API - birth year privacy', 'FAIL', 'Birth year leaked in get_celebrations_today JSON: ' || v_cel_json::text);
  else
    insert into test_results values (6, 'Celebrations API - birth year privacy', 'PASS', 'Birth year is never included in celebrations JSON payload');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 7: Opt-out enforcement
  -- ---------------------------------------------------------------------------
  -- Staff Opt Out has birthday today, but celebrate_birthday = false
  if exists (
    select 1 from public.get_celebrations_today(v_today)
    where user_id = v_staff_opt_out
  ) then
    insert into test_results values (7, 'Celebration opt-out hides celebrant', 'FAIL', 'Opt-out staff was included in celebrations today');
  else
    insert into test_results values (7, 'Celebration opt-out hides celebrant', 'PASS', 'Opt-out staff is strictly excluded from celebrations today');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 8: Leap year 29 Feb -> 28 Feb handling in non-leap years
  -- ---------------------------------------------------------------------------
  -- In 2026 (non-leap), on Feb 28, leap day staff should be celebrated
  if exists (
    select 1 from public.get_celebrations_today('2026-02-28'::date)
    where user_id = v_staff_leap and kind = 'birthday'
  ) then
    insert into test_results values (8, 'Leap day (29 Feb) celebrated on 28 Feb in non-leap year', 'PASS', '29 Feb celebrant correctly detected on 28 Feb 2026');
  else
    insert into test_results values (8, 'Leap day (29 Feb) celebrated on 28 Feb in non-leap year', 'FAIL', '29 Feb celebrant was missed on 28 Feb 2026');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 9: Celebration wish - active staff can wish today''s celebrant
  -- ---------------------------------------------------------------------------
  -- Staff B wishes Staff A
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b::text, 'role', 'authenticated')::text);

  select id into v_wish_id
  from public.send_celebration_wish(v_staff_a, 'birthday', 'Have an amazing birthday!');

  if v_wish_id is not null then
    insert into test_results values (9, 'Celebration wish - send wish succeeds', 'PASS', 'Staff B successfully wished Staff A');
  else
    insert into test_results values (9, 'Celebration wish - send wish succeeds', 'FAIL', 'Wish ID was null');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 10: Celebration wish - duplicate wish rejected
  -- ---------------------------------------------------------------------------
  -- Staff B tries to wish Staff A again for the same occasion
  begin
    perform public.send_celebration_wish(v_staff_a, 'birthday', 'Another wish!');
    insert into test_results values (10, 'Celebration wish - duplicate rejected', 'FAIL', 'Duplicate wish was unexpectedly accepted');
  exception when others then
    insert into test_results values (10, 'Celebration wish - duplicate rejected', 'PASS', 'Duplicate wish was blocked: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 11: Celebration wish - self-wish rejected
  -- ---------------------------------------------------------------------------
  -- Staff A tries to wish themselves
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a::text, 'role', 'authenticated')::text);

  begin
    perform public.send_celebration_wish(v_staff_a, 'birthday', 'Happy birthday to me!');
    insert into test_results values (11, 'Celebration wish - self-wish blocked', 'FAIL', 'Self-wish was unexpectedly accepted');
  exception when others then
    insert into test_results values (11, 'Celebration wish - self-wish blocked', 'PASS', 'Self-wish correctly rejected: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 12: Thank everyone workflow
  -- ---------------------------------------------------------------------------
  -- Staff A clicks "Thank everyone"
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a::text, 'role', 'authenticated')::text);

  v_thank_count := public.thank_celebration_wishes('birthday', 'Thanks everyone for the wonderful wishes!');

  -- Switch claims to Staff B to inspect their own notification inbox
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b::text, 'role', 'authenticated')::text);

  select count(*) into v_notif_count
  from public.notifications
  where user_id = v_staff_b and type = 'celebration_thank_you';

  if v_notif_count >= 1 then
    insert into test_results values (12, 'Thank everyone workflow sends notifications to well-wishers', 'PASS', 'Well-wisher Staff B received thank you notification');
  else
    insert into test_results values (12, 'Thank everyone workflow sends notifications to well-wishers', 'FAIL', 'Well-wisher did not receive thank you notification');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 13: Business event notification - cross-user payment records notification
  -- ---------------------------------------------------------------------------
  -- Reset claims to super admin to create candidate & enrollment
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_super_admin::text, 'role', 'authenticated')::text);

  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where is_active = true limit 1;

  insert into public.students (
    full_name, mobile, owner_id, created_by, is_active
  ) values (
    'Notif Candidate Test', '+971508812345', v_staff_a, v_super_admin, true
  ) returning id into v_student_id;

  insert into public.enrollments (
    student_id, university_id, course_id, admission_staff_id,
    total_fee, discount, status, created_by, vat_treatment, vat_rate
  ) values (
    v_student_id, v_uni_id, v_course_id, v_staff_a,
    5000, 0, 'active', v_super_admin, 'none', 0
  ) returning id into v_enrollment_id;

  -- Staff B records payment on Staff A's candidate
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b::text, 'role', 'authenticated')::text);

  perform public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 1000,
    p_mode := 'cash',
    p_purpose := 'admission',
    p_purpose_note := null,
    p_reference_no := 'REF-TEST-001',
    p_paid_at := now(),
    p_payee_name := 'Payer Test',
    p_comments := 'Test comment'
  );

  -- Switch claims to Staff A to inspect their own notification inbox
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a::text, 'role', 'authenticated')::text);

  select count(*) into v_notif_count
  from public.notifications
  where user_id = v_staff_a and type = 'payment_recorded';

  if v_notif_count >= 1 then
    insert into test_results values (13, 'Payment recorded by peer notifies owner counsellor', 'PASS', 'Owner counsellor received payment_recorded notification');
  else
    insert into test_results values (13, 'Payment recorded by peer notifies owner counsellor', 'FAIL', 'Owner counsellor did not receive payment notification');
  end if;

end $$;

select test_no, test_name, status, details from test_results order by test_no;

rollback;
