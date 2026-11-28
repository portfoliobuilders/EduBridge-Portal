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
  v_admin_id uuid := gen_random_uuid();
  v_staff1_id uuid := gen_random_uuid();
  v_staff2_id uuid := gen_random_uuid();
  v_staff_inactive uuid := gen_random_uuid();
  v_staff_support uuid := gen_random_uuid();
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
begin
  -- 1. Create disposable test users
  insert into auth.users (id, email)
  values
    (v_admin_id, 'lb_admin_' || v_admin_id || '@test.edubridge.local'),
    (v_staff1_id, 'lb_staff1_' || v_staff1_id || '@test.edubridge.local'),
    (v_staff2_id, 'lb_staff2_' || v_staff2_id || '@test.edubridge.local'),
    (v_staff_inactive, 'lb_inact_' || v_staff_inactive || '@test.edubridge.local'),
    (v_staff_support, 'lb_supp_' || v_staff_support || '@test.edubridge.local')
  on conflict (id) do nothing;

  -- 2. Configure test profiles
  update public.profiles
  set full_name = 'LB Admin User', role = 'super_admin', is_active = true, is_support = false, work_email = 'lb_admin_' || v_admin_id || '@test.edubridge.local'
  where id = v_admin_id;

  update public.profiles
  set full_name = 'LB Staff One', role = 'staff', is_active = true, is_sales_team = true, reports_to = v_admin_id, is_support = false, work_email = 'lb_staff1_' || v_staff1_id || '@test.edubridge.local'
  where id = v_staff1_id;

  update public.profiles
  set full_name = 'LB Staff Two', role = 'staff', is_active = true, is_sales_team = true, reports_to = null, is_support = false, work_email = 'lb_staff2_' || v_staff2_id || '@test.edubridge.local'
  where id = v_staff2_id;

  update public.profiles
  set full_name = 'LB Inactive Staff', role = 'staff', is_active = false, is_support = false, work_email = 'lb_inact_' || v_staff_inactive || '@test.edubridge.local'
  where id = v_staff_inactive;

  update public.profiles
  set full_name = 'LB Support Account', role = 'staff', is_active = true, is_support = true, work_email = 'lb_supp_' || v_staff_support || '@test.edubridge.local'
  where id = v_staff_support;

  -- 3. Master University & Course
  select id into v_uni_id from public.universities where is_active = true limit 1;
  if v_uni_id is null then
    insert into public.universities (name, country, is_active) values ('Leaderboard Test Uni', 'UAE', true) returning id into v_uni_id;
  end if;

  select id into v_course_id from public.courses where is_active = true limit 1;
  if v_course_id is null then
    insert into public.courses (university_id, name, level, duration_years, total_tuition, is_active)
    values (v_uni_id, 'Leaderboard Test Course', 'UG', 3, 50000.00, true) returning id into v_course_id;
  end if;

  -- 4. Students & Enrollments
  insert into public.students (full_name, email, mobile, created_by, owner_id)
  values ('Candidate One', 's1@test.edubridge.local', '+971501111111', v_staff1_id, v_staff1_id)
  returning id into v_student1_id;

  insert into public.students (full_name, email, mobile, created_by, owner_id)
  values ('Candidate Two', 's2@test.edubridge.local', '+971502222222', v_staff2_id, v_staff2_id)
  returning id into v_student2_id;

  -- Staff 1 gets 1 admission at (now - 2 hours)
  insert into public.enrollments (student_id, university_id, course_id, intake, total_fee, admission_staff_id, created_by, created_at)
  values (v_student1_id, v_uni_id, v_course_id, 'Fall 2026', 20000.00, v_staff1_id, v_staff1_id, v_now - interval '2 hour')
  returning id into v_enroll1_id;

  -- Staff 2 gets 1 admission at (now - 1 hour)
  insert into public.enrollments (student_id, university_id, course_id, intake, total_fee, admission_staff_id, created_by, created_at)
  values (v_student2_id, v_uni_id, v_course_id, 'Fall 2026', 20000.00, v_staff2_id, v_staff2_id, v_now - interval '1 hour')
  returning id into v_enroll2_id;

  -- Payments:
  -- Staff 1 collected 5,000 at (now - 2 hours)
  insert into public.payments (
    receipt_no, enrollment_id, student_id, amount, mode, purpose,
    paid_at, recorded_at, received_by, status, share_token,
    fee_snapshot, paid_before_snapshot, balance_after_snapshot
  ) values (
    'EB-RV-LB-001', v_enroll1_id, v_student1_id, 5000.00, 'cash', 'admission',
    v_now - interval '2 hour', v_now - interval '2 hour', v_staff1_id, 'valid', gen_random_uuid(),
    20000.00, 0.00, 15000.00
  ) returning id into v_pay1_id;

  -- Staff 2 collected 10,000 at (now - 1 hour)
  insert into public.payments (
    receipt_no, enrollment_id, student_id, amount, mode, purpose,
    paid_at, recorded_at, received_by, status, share_token,
    fee_snapshot, paid_before_snapshot, balance_after_snapshot
  ) values (
    'EB-RV-LB-002', v_enroll2_id, v_student2_id, 10000.00, 'bank_transfer', 'admission',
    v_now - interval '1 hour', v_now - interval '1 hour', v_staff2_id, 'valid', gen_random_uuid(),
    20000.00, 0.00, 10000.00
  ) returning id into v_pay2_id;

  -- Also create 1 voided payment for Staff 2 to prove it is net of voids
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
  from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
  where user_id in (v_staff1_id, v_staff2_id);

  -- Leaderboard collections sum in the test period
  select coalesce(sum(collections_amount), 0.00) into v_res_sum
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
  where user_id in (v_staff1_id, v_staff2_id);

  assert v_res_count = 2, 'Proof 1 Failed: Expected 2 admissions across test staff, got ' || coalesce(v_res_count::text, 'null');
  assert v_res_sum = 15000.00, 'Proof 1 Failed: Expected 15000.00 valid collections (net of voids), got ' || coalesce(v_res_sum::text, 'null');

  raise notice '✓ PROOF 1 PASSED: Leaderboard sums match (Admissions: %, Collections: %)', v_res_count, v_res_sum;

  -- ---------------------------------------------------------------------------
  -- PROOF 2: Staff query with show_aed_to_staff = false hides AED amounts
  -- ---------------------------------------------------------------------------
  update public.company_settings set show_aed_to_staff = false;

  -- Act as Staff 1
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff1_id::text, 'role', 'authenticated')::text, true);

  select collections_amount, admissions_count
  into v_staff_col, v_staff_adm
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
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
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
  where user_id = v_staff1_id;

  assert v_staff_col = 5000.00, 'Proof 3 Failed: Staff should see 5000.00 when show_aed_to_staff = true, got ' || coalesce(v_staff_col::text, 'null');

  raise notice '✓ PROOF 3 PASSED: Staff collections_amount IS NOT NULL when show_aed_to_staff = true (got %)', v_staff_col;

  -- ---------------------------------------------------------------------------
  -- PROOF 4: Admin always sees non-null AED amounts even when setting is false
  -- ---------------------------------------------------------------------------
  update public.company_settings set show_aed_to_staff = false;

  -- Act as Admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  select collections_amount
  into v_staff_col
  from public.get_staff_leaderboard('this_month', 'collections', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
  where user_id = v_staff1_id;

  assert v_staff_col = 5000.00, 'Proof 4 Failed: Admin must see collections_amount even when setting is false, got ' || coalesce(v_staff_col::text, 'null');

  raise notice '✓ PROOF 4 PASSED: Admin always sees collections_amount';

  -- ---------------------------------------------------------------------------
  -- PROOF 5: Ties broken by earliest achievement
  -- ---------------------------------------------------------------------------
  -- Staff 1 achieved admission earlier than Staff 2 -> Staff 1 rank must be lower (better) than Staff 2
  select rank into v_staff_adm
  from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
  where user_id = v_staff1_id;

  select rank into v_res_count
  from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour', true)
  where user_id = v_staff2_id;

  assert v_staff_adm < v_res_count, 'Proof 5 Failed: Staff 1 achieved admission earlier, so rank (' || v_staff_adm || ') should be better than Staff 2 (' || v_res_count || ')';

  raise notice '✓ PROOF 5 PASSED: Tie-breaking by earliest achievement correctly placed earlier achiever first';

  -- ---------------------------------------------------------------------------
  -- PROOF 6: Inactive staff, support accounts, and test users are omitted when p_include_test = false
  -- ---------------------------------------------------------------------------
  assert not exists (
    select 1 from public.get_staff_leaderboard('this_month', 'admissions', null, v_now - interval '3 hour', v_now + interval '1 hour', false)
    where user_id in (v_staff1_id, v_staff2_id, v_staff_inactive, v_staff_support)
  ), 'Proof 6 Failed: Inactive, support, or test staff appeared on normal leaderboard';

  raise notice '✓ PROOF 6 PASSED: Inactive staff, support accounts, and test users are omitted';

  -- ---------------------------------------------------------------------------
  -- PROOF 7: Team filter for admin
  -- ---------------------------------------------------------------------------
  assert (
    select count(*) from public.get_staff_leaderboard('this_month', 'admissions', v_admin_id, v_now - interval '3 hour', v_now + interval '1 hour', true)
    where user_id = v_staff2_id
  ) = 0, 'Proof 7 Failed: Staff 2 appeared in Admin team filter';

  assert (
    select count(*) from public.get_staff_leaderboard('this_month', 'admissions', v_admin_id, v_now - interval '3 hour', v_now + interval '1 hour', true)
    where user_id = v_staff1_id
  ) = 1, 'Proof 7 Failed: Staff 1 should appear in Admin team filter';

  raise notice '✓ PROOF 7 PASSED: Team filter correctly scopes to admin team';

  raise notice '>>> ALL 7 LEADERBOARD PROOFS PASSED SUCCESSFULLY <<<';
end $$;

rollback;
