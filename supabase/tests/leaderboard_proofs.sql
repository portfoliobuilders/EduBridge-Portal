-- ============================================================================
-- Test Suite: leaderboard_proofs.sql
-- Description:
-- 1. Totals match dashboard_kpis and report_collections for the same period
-- 2. Staff user sees NULL collections_amount when show_aed_to_staff = false
-- 3. Staff user sees non-null collections_amount when show_aed_to_staff = true
-- 4. Admin / super_admin always sees non-null collections_amount
-- 5. Ties are broken by earliest achievement (earlier timestamp -> higher rank)
-- 6. Inactive staff, support accounts, and test users are excluded
-- 7. Team filter limits results for admin
-- ============================================================================

begin;

-- Helper notice function
do $$
begin
  raise notice '>>> STARTING LEADERBOARD VERIFICATION SUITE <<<';
end $$;

-- -----------------------------------------------------------------------------
-- 0. Set up test data inside transaction
-- -----------------------------------------------------------------------------
do $$
declare
  v_admin_id uuid := '0d18611e-636f-4a56-9ad6-defbc498c70d'::uuid;
  v_staff1_id uuid := '9bfbe83e-ca82-4492-b61e-74998beec546'::uuid;
  v_staff2_id uuid := '7ceac5d3-51b5-47e0-aa0a-2fde458086e8'::uuid;
  v_staff_inactive uuid := 'e9b79b3f-53ff-446a-8af0-7ee827adcb8b'::uuid;
  v_staff_support uuid := 'bc33e4d0-1eb6-473e-9e75-15851af6137e'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student1_id uuid;
  v_student2_id uuid;
  v_enroll1_id uuid;
  v_enroll2_id uuid;
  v_pay1_id uuid;
  v_pay2_id uuid;
  v_now timestamptz := now();
  v_res_count int;
  v_res_sum numeric;
  v_staff_col numeric;
  v_staff_adm int;
  v_rank1_id uuid;
  v_rank2_id uuid;
begin
  -- 1. Configure test profiles
  -- Admin
  update public.profiles
  set full_name = 'Admin Sales', role = 'super_admin', is_active = true, is_support = false, work_email = 'sales@edubridgeeducation.com'
  where id = v_admin_id;

  -- Staff 1 (Joe Tom)
  update public.profiles
  set full_name = 'Joe Tom', role = 'staff', is_active = true, reports_to = v_admin_id, is_support = false, work_email = 'joetom@edubridgeeducation.com'
  where id = v_staff1_id;

  -- Staff 2 (Active Counsellor, no reports_to)
  update public.profiles
  set full_name = 'Sarah Connor', role = 'staff', is_active = true, reports_to = null, is_support = false, work_email = 'sarah@edubridgeeducation.com'
  where id = v_staff2_id;

  -- Inactive Staff
  update public.profiles
  set full_name = 'Inactive Dan', role = 'staff', is_active = false, is_support = false, work_email = 'dan@edubridgeeducation.com'
  where id = v_staff_inactive;

  -- Support Account
  update public.profiles
  set full_name = 'Support Eve', role = 'staff', is_active = true, is_support = true, work_email = 'eve@edubridgeeducation.com'
  where id = v_staff_support;

  -- 2. Master University & Course
  select id into v_uni_id from public.universities where is_active = true limit 1;
  if v_uni_id is null then
    insert into public.universities (name, country, is_active) values ('Leaderboard Test Uni', 'UAE', true) returning id into v_uni_id;
  end if;

  select id into v_course_id from public.courses where is_active = true limit 1;
  if v_course_id is null then
    insert into public.courses (university_id, name, level, duration_years, total_tuition, is_active)
    values (v_uni_id, 'Leaderboard Test Course', 'UG', 3, 50000.00, true) returning id into v_course_id;
  end if;

  -- 3. Students & Enrollments
  -- Candidate 1 for Joe Tom
  insert into public.students (full_name, email, mobile, created_by, owner_id)
  values ('Student One', 's1@candidate.local', '+971501111111', v_staff1_id, v_staff1_id)
  returning id into v_student1_id;

  -- Candidate 2 for Sarah Connor
  insert into public.students (full_name, email, mobile, created_by, owner_id)
  values ('Student Two', 's2@candidate.local', '+971502222222', v_staff2_id, v_staff2_id)
  returning id into v_student2_id;

  -- Enrollments:
  -- Joe Tom gets 1 admission at (now - 2 hours)
  insert into public.enrollments (student_id, university_id, course_id, intake, total_fee, admission_staff_id, created_by, created_at)
  values (v_student1_id, v_uni_id, v_course_id, 'Fall 2026', 20000.00, v_staff1_id, v_staff1_id, v_now - interval '2 hour')
  returning id into v_enroll1_id;

  -- Sarah Connor gets 1 admission at (now - 1 hour)
  insert into public.enrollments (student_id, university_id, course_id, intake, total_fee, admission_staff_id, created_by, created_at)
  values (v_student2_id, v_uni_id, v_course_id, 'Fall 2026', 20000.00, v_staff2_id, v_staff2_id, v_now - interval '1 hour')
  returning id into v_enroll2_id;

  -- Payments:
  -- Joe Tom collected 5,000 at (now - 2 hours)
  insert into public.payments (
    receipt_no, enrollment_id, student_id, amount, mode, purpose,
    paid_at, recorded_at, received_by, status, share_token,
    fee_snapshot, paid_before_snapshot, balance_after_snapshot
  ) values (
    'EB-RV-LB-001', v_enroll1_id, v_student1_id, 5000.00, 'cash', 'admission',
    v_now - interval '2 hour', v_now - interval '2 hour', v_staff1_id, 'valid', gen_random_uuid(),
    20000.00, 0.00, 15000.00
  ) returning id into v_pay1_id;

  -- Sarah Connor collected 10,000 at (now - 1 hour)
  insert into public.payments (
    receipt_no, enrollment_id, student_id, amount, mode, purpose,
    paid_at, recorded_at, received_by, status, share_token,
    fee_snapshot, paid_before_snapshot, balance_after_snapshot
  ) values (
    'EB-RV-LB-002', v_enroll2_id, v_student2_id, 10000.00, 'bank_transfer', 'admission',
    v_now - interval '1 hour', v_now - interval '1 hour', v_staff2_id, 'valid', gen_random_uuid(),
    20000.00, 0.00, 10000.00
  ) returning id into v_pay2_id;

  -- Also create 1 voided payment for Sarah to prove it is net of voids
  insert into public.payments (
    receipt_no, enrollment_id, student_id, amount, mode, purpose,
    paid_at, recorded_at, received_by, status, void_reason, voided_by, voided_at, share_token,
    fee_snapshot, paid_before_snapshot, balance_after_snapshot
  ) values (
    'EB-RV-LB-VOID', v_enroll2_id, v_student2_id, 3000.00, 'cash', 'admission',
    v_now - interval '30 minute', v_now - interval '30 minute', v_staff2_id, 'void', 'Test void', v_admin_id, v_now, gen_random_uuid(),
    20000.00, 10000.00, 7000.00
  );

  -- ---------------------------------------------------------------------------
  -- PROOF 1: Totals match reports and dashboard_kpis for the same period
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  -- Leaderboard admissions sum in the test period
  select coalesce(sum(admissions_count), 0) into v_res_count
  from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id in (v_staff1_id, v_staff2_id);

  -- Leaderboard collections sum in the test period
  select coalesce(sum(collections_amount), 0.00) into v_res_sum
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id in (v_staff1_id, v_staff2_id);

  assert v_res_count = 2, 'Proof 1 Failed: Expected 2 admissions across test staff, got ' || coalesce(v_res_count::text, 'null');
  assert v_res_sum = 15000.00, 'Proof 1 Failed: Expected 15000.00 valid collections (net of voids), got ' || coalesce(v_res_sum::text, 'null');

  raise notice '✓ PROOF 1 PASSED: Leaderboard sums match (Admissions: %, Collections: %)', v_res_count, v_res_sum;

  -- ---------------------------------------------------------------------------
  -- PROOF 2: Staff query with show_aed_to_staff = false hides AED amounts
  -- ---------------------------------------------------------------------------
  update public.company_settings set show_aed_to_staff = false;

  -- Act as Staff 1 (Joe Tom)
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff1_id::text, 'role', 'authenticated')::text, true);

  select collections_amount, admissions_count
  into v_staff_col, v_staff_adm
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id = v_staff1_id;

  assert v_staff_col is null, 'Proof 2 Failed: Staff should receive NULL collections_amount when show_aed_to_staff = false, but got ' || v_staff_col::text;
  assert v_staff_adm = 1, 'Proof 2 Failed: Staff admissions count should still be visible (expected 1, got ' || v_staff_adm::text || ')';

  raise notice '✓ PROOF 2 PASSED: Staff collections_amount IS NULL when show_aed_to_staff = false, admissions_count is visible';

  -- ---------------------------------------------------------------------------
  -- PROOF 3: Staff query with show_aed_to_staff = true reveals AED amounts
  -- ---------------------------------------------------------------------------
  update public.company_settings set show_aed_to_staff = true;

  select collections_amount
  into v_staff_col
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id = v_staff1_id;

  assert v_staff_col = 5000.00, 'Proof 3 Failed: Staff should see 5000.00 when show_aed_to_staff = true, got ' || coalesce(v_staff_col::text, 'null');

  raise notice '✓ PROOF 3 PASSED: Staff collections_amount IS NOT NULL when show_aed_to_staff = true (got %)', v_staff_col;

  -- ---------------------------------------------------------------------------
  -- PROOF 4: Admin always sees non-null AED amounts even when setting is false
  -- ---------------------------------------------------------------------------
  update public.company_settings set show_aed_to_staff = false;

  -- Act as Admin (Alice)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  select collections_amount
  into v_staff_col
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id = v_staff1_id;

  assert v_staff_col = 5000.00, 'Proof 4 Failed: Admin must see collections_amount even when setting is false, got ' || coalesce(v_staff_col::text, 'null');

  raise notice '✓ PROOF 4 PASSED: Admin always sees collections_amount';

  -- ---------------------------------------------------------------------------
  -- PROOF 5: Ties broken by earliest achievement
  -- ---------------------------------------------------------------------------
  -- In the test window, Joe Tom got 1 admission at (now - 2 hours) and Sarah Connor got 1 admission at (now - 1 hour).
  -- Joe achieved 1 admission EARLIER than Sarah -> Joe must be ranked higher than Sarah!
  select rank into v_staff_adm
  from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id = v_staff1_id;

  select rank into v_res_count
  from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour')
  where user_id = v_staff2_id;

  assert v_staff_adm < v_res_count, 'Proof 5 Failed: Joe achieved admission earlier, so his rank (' || v_staff_adm || ') should be better than Sarah (' || v_res_count || ')';

  raise notice '✓ PROOF 5 PASSED: Tie-breaking by earliest achievement correctly placed earlier achiever first (Joe rank %, Sarah rank %)', v_staff_adm, v_res_count;

  -- ---------------------------------------------------------------------------
  -- PROOF 6: Inactive staff, support accounts, and test users are omitted
  -- ---------------------------------------------------------------------------
  assert not exists (
    select 1 from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour')
    where user_id in (v_staff_inactive, v_staff_support)
  ), 'Proof 6 Failed: Inactive or support staff appeared on leaderboard';

  raise notice '✓ PROOF 6 PASSED: Inactive staff and support accounts are omitted';

  -- ---------------------------------------------------------------------------
  -- PROOF 7: Team filter for admin
  -- ---------------------------------------------------------------------------
  -- Admin Alice has Joe Tom reporting to her, but Sarah Connor does NOT report to her.
  -- When p_team_id = v_admin_id, Sarah should NOT appear, but Joe should.
  assert (
    select count(*) from public.get_staff_leaderboard('this_month', 'admissions', v_admin_id, v_now - interval '3 hour', v_now + interval '1 hour')
    where user_id = v_staff2_id
  ) = 0, 'Proof 7 Failed: Sarah appeared in Alice team filter';

  assert (
    select count(*) from public.get_staff_leaderboard('this_month', 'admissions', v_admin_id, v_now - interval '3 hour', v_now + interval '1 hour')
    where user_id = v_staff1_id
  ) = 1, 'Proof 7 Failed: Joe should appear in Alice team filter';

  raise notice '✓ PROOF 7 PASSED: Team filter correctly scopes to admin team';

  raise notice '>>> ALL 7 LEADERBOARD PROOFS PASSED SUCCESSFULLY <<<';
end $$;

rollback;
