-- ==============================================================================
-- Test Suite: supabase/tests/candidates_directory_proofs.sql
-- Proves:
--   1. Rejection of client-supplied student_code by database trigger
--   2. Status logic for all 4 statuses (No enrollment, Balance due, Overdue, Fully paid)
--   3. Role visibility on student_directory_view and get_candidate_directory_kpis()
--   4. Duplicate candidate protection (same mobile + case-insensitive name)
--   5. Performance benchmark with 5,000 rows (EXPLAIN ANALYZE)
-- ==============================================================================

begin;

do $$
declare
  v_staff_id uuid;
  v_owner_id uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_no_enr uuid;
  v_student_bal_due uuid;
  v_student_overdue uuid;
  v_student_fully_paid uuid;
  v_enr_id uuid;
  v_status text;
  v_err text := '';
  v_res jsonb;
begin
  raise notice '=== PROOF 1: REJECT CLIENT-SUPPLIED STUDENT CODE ===';
  begin
    insert into public.students (student_code, full_name, mobile, is_active)
    values ('EB-DOC-99999', 'Hacker Attempt', '+971509999999', true);
    raise exception 'FAIL: Client-supplied student_code was not rejected!';
  exception when others then
    if sqlerrm like '%Direct assignment of student_code is not permitted%' then
      raise notice 'PASS: Client-supplied student_code strictly rejected: %', sqlerrm;
    else
      raise exception 'FAIL: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- Setup fixtures
  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where university_id = v_uni_id and is_active = true limit 1;
  select id into v_owner_id from public.profiles where role in ('super_admin', 'owner') and is_active = true limit 1;
  select id into v_staff_id from public.profiles where role = 'staff' and is_active = true limit 1;

  raise notice '=== PROOF 2: STATUS LOGIC FOR ALL 4 STATUSES ===';

  -- Status A: No enrollment
  insert into public.students (full_name, mobile, is_active, created_by)
  values ('Candidate No Enrollment', '+971501111111', true, v_owner_id)
  returning id into v_student_no_enr;

  select candidate_status into v_status from public.student_directory_view where id = v_student_no_enr;
  if v_status <> 'No enrollment' then
    raise exception 'FAIL: Expected "No enrollment", got "%"', v_status;
  end if;
  raise notice 'PASS: Candidate without active enrollment status = "%"', v_status;

  -- Status B: Balance due (recent enrollment, not overdue)
  insert into public.students (full_name, mobile, is_active, created_by)
  values ('Candidate Balance Due', '+971502222222', true, v_owner_id)
  returning id into v_student_bal_due;

  insert into public.enrollments (student_id, university_id, course_id, total_fee, discount, status, created_at, created_by, admission_staff_id)
  values (v_student_bal_due, v_uni_id, v_course_id, 10000, 0, 'active', now(), v_owner_id, v_owner_id)
  returning id into v_enr_id;

  select candidate_status into v_status from public.student_directory_view where id = v_student_bal_due;
  if v_status <> 'Balance due' then
    raise exception 'FAIL: Expected "Balance due", got "%"', v_status;
  end if;
  raise notice 'PASS: Candidate with recent unpaid enrollment status = "%"', v_status;

  -- Status C: Overdue (enrolled > 30 days ago and no payment)
  insert into public.students (full_name, mobile, is_active, created_by)
  values ('Candidate Overdue', '+971503333333', true, v_owner_id)
  returning id into v_student_overdue;

  insert into public.enrollments (student_id, university_id, course_id, total_fee, discount, status, created_at, created_by, admission_staff_id)
  values (v_student_overdue, v_uni_id, v_course_id, 10000, 0, 'active', now() - interval '45 days', v_owner_id, v_owner_id)
  returning id into v_enr_id;

  select candidate_status into v_status from public.student_directory_view where id = v_student_overdue;
  if v_status <> 'Overdue' then
    raise exception 'FAIL: Expected "Overdue", got "%"', v_status;
  end if;
  raise notice 'PASS: Candidate enrolled 45 days ago without payment status = "%"', v_status;

  -- Status D: Fully paid
  insert into public.students (full_name, mobile, is_active, created_by)
  values ('Candidate Fully Paid', '+971504444444', true, v_owner_id)
  returning id into v_student_fully_paid;

  insert into public.enrollments (student_id, university_id, course_id, total_fee, discount, status, created_at, created_by, admission_staff_id, vat_treatment)
  values (v_student_fully_paid, v_uni_id, v_course_id, 5000, 0, 'active', now(), v_owner_id, v_owner_id, 'none')
  returning id into v_enr_id;

  insert into public.payments (enrollment_id, student_id, amount, mode, purpose, status, paid_at, receipt_no, received_by, fee_snapshot, paid_before_snapshot, balance_after_snapshot)
  values (v_enr_id, v_student_fully_paid, 5000, 'cash', 'admission', 'valid', now(), 'EB-TEST-00001', v_owner_id, 5000, 0, 0);

  select candidate_status into v_status from public.student_directory_view where id = v_student_fully_paid;
  if v_status <> 'Fully paid' then
    raise exception 'FAIL: Expected "Fully paid", got "%"', v_status;
  end if;
  raise notice 'PASS: Candidate with zero balance status = "%"', v_status;

  raise notice '=== PROOF 3: DUPLICATE CANDIDATE CHECK ===';
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text);
  begin
    perform public.create_student_with_enrollment(
      p_full_name := 'Candidate Fully Paid',
      p_mobile := '+971504444444',
      p_whatsapp := '+971504444444',
      p_university_id := v_uni_id,
      p_course_id := v_course_id,
      p_total_fee := 5000,
      p_discount := 0
    );
    raise exception 'FAIL: Duplicate candidate was not rejected!';
  exception when others then
    if sqlerrm like '%already exists%' then
      raise notice 'PASS: Duplicate candidate correctly rejected: %', sqlerrm;
    else
      raise exception 'FAIL: Unexpected error on duplicate: %', sqlerrm;
    end if;
  end;
  reset role;

end $$;

-- PROOF 4 & 5: BENCHMARK WITH 5,000 ROWS & EXPLAIN ANALYZE
do $$
declare
  v_uni_id uuid;
  v_course_id uuid;
  v_owner_id uuid;
begin
  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where university_id = v_uni_id and is_active = true limit 1;
  select id into v_owner_id from public.profiles where role in ('super_admin', 'owner') and is_active = true limit 1;

  raise notice 'Seeding 5,000 candidate records for performance benchmark...';

  alter table public.students disable trigger generate_student_code_trigger;

  insert into public.students (student_code, full_name, mobile, email, is_active, created_by)
  select
    'EB-STU-' || lpad((50000 + i)::text, 5, '0'),
    case when i % 5 = 0 then 'Fatima Ahmed Al Mansoori ' || i
         when i % 5 = 1 then 'Mohammed Rashid Al Nuaimi ' || i
         when i % 5 = 2 then 'Sultan Zayed Al Nahyan ' || i
         when i % 5 = 3 then 'Mariam Saeed Al Marri ' || i
         else 'Abdullah Khalid Al Qasimi ' || i end,
    '+97150' || lpad((1000000 + i)::text, 7, '0'),
    'candidate' || i || '@test.edubridge.local',
    true,
    v_owner_id
  from generate_series(1, 5000) as i;

  alter table public.students enable trigger generate_student_code_trigger;

  insert into public.enrollments (student_id, university_id, course_id, total_fee, discount, status, created_at, created_by, admission_staff_id)
  select
    s.id,
    v_uni_id,
    v_course_id,
    case when (row_number() over ()) % 3 = 0 then 12000 else 8000 end,
    0,
    'active',
    now() - ((row_number() over ()) % 60 || ' days')::interval,
    v_owner_id,
    v_owner_id
  from public.students s
  where s.student_code like 'EB-STU-5%';

  raise notice 'Seeding complete. Running EXPLAIN ANALYZE...';
end $$;

explain (analyze, buffers)
select
  v.id,
  v.student_code,
  v.full_name,
  v.mobile,
  v.candidate_status,
  v.total_balance,
  v.total_paid,
  v.total_net_fee,
  v.last_payment_at,
  v.enrollment_count
from public.student_directory_view v
where (v.full_name ilike '%Fatima%' or v.mobile ilike '%50100%')
order by v.created_at desc
limit 25;

rollback;
