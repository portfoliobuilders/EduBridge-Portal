-- ============================================================================
-- Test Suite: ownership_and_attendance_proofs.sql
-- Verification for Candidate Ownership, Transfer & Attendance Security (Section I)
--
-- Single transaction with complete rollback.
-- ============================================================================

begin;

create temp table ownership_att_results (
  step int,
  test_name text,
  status text,
  details text
) on commit drop;

grant all on ownership_att_results to authenticated, anon;

do $$
declare
  v_admin_id uuid := '10101010-1010-4010-8010-101010101010'::uuid;
  v_staff_a_id uuid := '20202020-2020-4020-8020-202020202020'::uuid;
  v_staff_b_id uuid := '30303030-3030-4030-8030-303030303030'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_b_id uuid;
  v_student_b_code text;
  v_enrollment_b_id uuid;
  v_payment_b_id uuid;
  v_office_id uuid;
  v_punch_a_id uuid;
  v_lookup jsonb;
  v_count int;
  v_caught boolean;
begin
  -- 0. Seed test staff & admin
  insert into auth.users (id, email)
  values
    (v_admin_id, 'test_adm_i@test.edubridge.local'),
    (v_staff_a_id, 'test_staff_a_i@test.edubridge.local'),
    (v_staff_b_id, 'test_staff_b_i@test.edubridge.local')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active, admin_scope, reports_to, work_email)
  values
    (v_admin_id, 'Admin I', 'admin', true, 'team', null, 'test_adm_i@test.edubridge.local'),
    (v_staff_a_id, 'Staff A', 'staff', true, 'team', v_admin_id, 'test_staff_a_i@test.edubridge.local'),
    (v_staff_b_id, 'Staff B', 'staff', true, 'team', null, 'test_staff_b_i@test.edubridge.local')
  on conflict (id) do update set
    role = excluded.role,
    reports_to = excluded.reports_to,
    is_active = true;

  -- Seed university & course
  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where university_id = v_uni_id and is_active = true limit 1;

  -- Create candidate owned by Staff B (code generated automatically by trigger)
  insert into public.students (full_name, mobile, whatsapp, created_by, owner_id)
  values ('Candidate B Owned', '+971501112233', '+971501112233', v_staff_b_id, v_staff_b_id)
  returning id, student_code into v_student_b_id, v_student_b_code;

  insert into public.enrollments (student_id, university_id, course_id, total_fee, discount, admission_staff_id, created_by, status)
  values (v_student_b_id, v_uni_id, v_course_id, 10000, 0, v_staff_b_id, v_staff_b_id, 'active')
  returning id into v_enrollment_b_id;

  insert into public.payments (enrollment_id, student_id, receipt_no, amount, mode, purpose, fee_snapshot, paid_before_snapshot, balance_after_snapshot, paid_at, received_by)
  values (v_enrollment_b_id, v_student_b_id, 'EB-RV-2026-98765', 2000, 'card', 'admission', 10000, 0, 8000, now(), v_staff_b_id)
  returning id into v_payment_b_id;

  -- Seed Office for attendance
  insert into public.offices (name, address, latitude, longitude, radius_m, require_network_match, is_active)
  values ('Dubai Test Office', 'Royal House', 25.276987, 55.337042, 100, false, true)
  returning id into v_office_id;

  insert into public.staff_attendance_settings (user_id, office_id, shift_start, shift_end, attendance_required, allow_field_punch)
  values (v_staff_a_id, v_office_id, '09:00', '18:00', true, false)
  on conflict (user_id) do update set office_id = v_office_id, allow_field_punch = false;

  -- -------------------------------------------------------------------------
  -- 1. CANDIDATE OWNERSHIP ISOLATION
  -- -------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);

  -- 1a. Staff A cannot select Staff B's candidate
  select count(*) into v_count from public.students where id = v_student_b_id;
  insert into ownership_att_results values (1, 'Staff A select Staff B candidate rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A cannot view Staff B candidate in students table');

  -- 1b. Staff A cannot update Staff B's candidate
  update public.students set full_name = 'Hacked Name' where id = v_student_b_id;
  get diagnostics v_count = row_count;
  insert into ownership_att_results values (2, 'Staff A update Staff B candidate rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A update on Staff B candidate affected 0 rows');

  -- 1c. Staff A cannot select Staff B's enrollment
  select count(*) into v_count from public.enrollments where id = v_enrollment_b_id;
  insert into ownership_att_results values (3, 'Staff A select Staff B enrollment rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A cannot select Staff B enrollment');

  -- 1d. Staff A cannot select Staff B's payment
  select count(*) into v_count from public.payments where id = v_payment_b_id;
  insert into ownership_att_results values (4, 'Staff A select Staff B payment rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A cannot view Staff B payment rows');

  -- -------------------------------------------------------------------------
  -- 2. COUNTER LOOKUP RPC TESTS
  -- -------------------------------------------------------------------------
  -- 2a. Exact full mobile returns candidate
  select public.lookup_candidate_for_payment('+971501112233') into v_lookup;
  insert into ownership_att_results values (5, 'Counter lookup exact mobile succeeds', case when (v_lookup->>'student_id') = v_student_b_id::text then 'PASS' else 'FAIL' end, 'Found candidate via full international mobile');

  -- 2b. Exact student_code returns candidate
  select public.lookup_candidate_for_payment(v_student_b_code) into v_lookup;
  insert into ownership_att_results values (6, 'Counter lookup exact student_code succeeds', case when (v_lookup->>'student_id') = v_student_b_id::text then 'PASS' else 'FAIL' end, 'Found candidate via exact code');

  -- 2c. Partial mobile returns 0 rows (NULL)
  select public.lookup_candidate_for_payment('112233') into v_lookup;
  insert into ownership_att_results values (7, 'Counter lookup partial mobile rejected', case when v_lookup is null then 'PASS' else 'FAIL' end, 'Partial mobile query returns NULL');

  -- 2d. Partial student code returns 0 rows (NULL)
  select public.lookup_candidate_for_payment(substring(v_student_b_code from 1 for 6)) into v_lookup;
  insert into ownership_att_results values (8, 'Counter lookup partial code rejected', case when v_lookup is null then 'PASS' else 'FAIL' end, 'Prefix query returns NULL');

  -- 2e. Counter lookup returns masked mobile and minimal fields
  select public.lookup_candidate_for_payment(v_student_b_code) into v_lookup;
  insert into ownership_att_results values (9, 'Counter lookup returns minimal masked payload', case when (v_lookup ? 'student_id') and (v_lookup ? 'masked_mobile') and not (v_lookup ? 'whatsapp') then 'PASS' else 'FAIL' end, 'Counter receives only safe payload without personal data');

  -- -------------------------------------------------------------------------
  -- 3. CANDIDATE TRANSFER & SALES CREDIT IMMUTABILITY
  -- -------------------------------------------------------------------------
  -- 3a. Staff A cannot transfer candidate
  v_caught := false;
  begin
    perform public.transfer_candidate(v_student_b_id, v_staff_a_id, 'candidate', 'Staff attempt transfer');
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (10, 'Staff transfer candidate rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff forbidden from calling transfer_candidate RPC');

  -- 3b. Admin transfers candidate to Staff A -> audit log & transfer log created
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text);
  perform public.transfer_candidate(v_student_b_id, v_staff_a_id, 'candidate', 'Approved counselor reallocation');

  select count(*) into v_count from public.candidate_transfers where student_id = v_student_b_id and to_user = v_staff_a_id;
  insert into ownership_att_results values (11, 'Transfer writes candidate_transfers record', case when v_count > 0 then 'PASS' else 'FAIL' end, 'Audit history recorded in candidate_transfers');

  -- 3c. Sales credit: enrollment admission_staff_id remains Staff B after candidate owner transfer
  select admission_staff_id into v_staff_b_id from public.enrollments where id = v_enrollment_b_id;
  insert into ownership_att_results values (12, 'Sales credit immutable across candidate transfer', case when v_staff_b_id = '30303030-3030-4030-8030-303030303030'::uuid then 'PASS' else 'FAIL' end, 'Admission staff remains unchanged on existing enrollment');

  -- -------------------------------------------------------------------------
  -- 4. ATTENDANCE SECURITY TESTS
  -- -------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);

  -- 4a. Staff A cannot insert punch for Staff B
  v_caught := false;
  begin
    insert into public.attendance_punches (user_id, office_id, kind, at, status)
    values (v_staff_b_id, v_office_id, 'in', now(), 'accepted');
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (13, 'Staff A insert punch for Staff B rejected', case when v_caught then 'PASS' else 'FAIL' end, 'RLS blocks inserting punch for another staff member');

  -- 4b. Staff A cannot edit own punch time or location
  set local role postgres;
  insert into public.attendance_punches (user_id, office_id, kind, at, lat, lng, status)
  values (v_staff_a_id, v_office_id, 'in', now(), 25.276987, 55.337042, 'accepted')
  returning id into v_punch_a_id;

  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);

  v_caught := false;
  begin
    update public.attendance_punches set at = now() - interval '2 hours' where id = v_punch_a_id;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      v_caught := false;
    else
      v_caught := true;
    end if;
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (14, 'Staff edit punch time rejected', case when v_caught then 'PASS' else 'FAIL' end, 'attendance_punches is immutable for updates');

  -- 4c. Server-verified geofence (punch RPC outside office radius rejected)
  set local role postgres;
  insert into public.staff_attendance_settings (user_id, office_id, shift_start, shift_end, attendance_required, allow_field_punch)
  values (v_staff_b_id, v_office_id, '09:00', '18:00', true, false)
  on conflict (user_id) do update set office_id = v_office_id, allow_field_punch = false;

  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b_id, 'role', 'authenticated')::text);

  -- Punch with coordinates 10km away from office
  select public.punch('in', 25.100000, 55.100000, 10, 'Trying outside geofence') into v_lookup;
  insert into ownership_att_results values (15, 'Server geofence rejects punch outside radius', case when (v_lookup->>'status') = 'rejected' and (v_lookup->>'success') = 'false' then 'PASS' else 'FAIL' end, 'punch() RPC calculated distance > radius and returned rejected status');

end $$;

select step, test_name, status, details from ownership_att_results order by step;

rollback;
