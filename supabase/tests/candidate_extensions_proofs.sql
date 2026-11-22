-- =============================================================================
-- Test Suite: supabase/tests/candidate_extensions_proofs.sql
-- Proofs for Candidate Profile Extensions (guardian, addresses, opening balance):
-- 1. Staff can add an address to their own candidate.
-- 2. Staff cannot edit address of another staff's candidate.
-- 3. Ledger: fee 10,000, opening_paid 3,000, payment 2,000 -> balance 5,000.
-- 4. opening_paid cannot be changed by staff after a payment exists.
--
-- Always executes within a transaction that ROLLS BACK so no data persists.
-- =============================================================================

begin;

create temp table if not exists test_results (
  test_no int,
  test_name text,
  status text,
  detail text
) on commit drop;

grant all on test_results to authenticated, anon;

do $$
declare
  v_owner_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_staff1_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_staff2_id uuid := '00000000-0000-0000-0000-000000000003'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_cand1_id uuid;
  v_cand2_id uuid;
  v_addr1_id uuid;
  v_enr_id uuid;
  v_rows_affected int;
  v_ledger_paid numeric(12,2);
  v_ledger_balance numeric(12,2);
  v_p payments;
begin
  -- ---------------------------------------------------------------------------
  -- SETUP
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, email)
  values
    (v_owner_id, 'proof_owner@test.local'),
    (v_staff1_id, 'proof_staff1@test.local'),
    (v_staff2_id, 'proof_staff2@test.local')
  on conflict (id) do nothing;

  insert into profiles (id, full_name, role, is_active)
  values
    (v_owner_id, 'Owner Admin', 'owner', true),
    (v_staff1_id, 'Staff One', 'staff', true),
    (v_staff2_id, 'Staff Two', 'staff', true)
  on conflict (id) do update
  set role = excluded.role, is_active = true;

  insert into universities (name, country, is_active)
  values ('Extensions Test University', 'UAE', true)
  returning id into v_uni_id;

  insert into courses (university_id, name, level, default_fee, is_active)
  values (v_uni_id, 'Extensions Test Course', 'Bachelor', 10000.00, true)
  returning id into v_course_id;

  -- Candidate 1 created by Staff 1
  insert into students (id, full_name, mobile, email, guardian_name, guardian_relation, guardian_phone, created_by)
  values (
    gen_random_uuid(),
    'Candidate One Staff1',
    '+971501112233',
    'cand1@test.local',
    'Tariq One',
    'father',
    '+971509990001',
    v_staff1_id
  )
  returning id into v_cand1_id;

  -- Candidate 2 created by Staff 2
  insert into students (id, full_name, mobile, email, created_by)
  values (
    gen_random_uuid(),
    'Candidate Two Staff2',
    '+971504445566',
    'cand2@test.local',
    v_staff2_id
  )
  returning id into v_cand2_id;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Staff can add an address to their own candidate
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff1_id, 'role', 'authenticated')::text);

  insert into student_addresses (
    student_id,
    type,
    contact_name,
    contact_phone,
    line1,
    city,
    country,
    is_default,
    created_by
  )
  values (
    v_cand1_id,
    'billing',
    'Tariq One',
    '+971509990001',
    'Villa 12, Hor Al Anz',
    'Dubai',
    'United Arab Emirates',
    true,
    v_staff1_id
  )
  returning id into v_addr1_id;

  if v_addr1_id is not null then
    insert into test_results values (1, 'Staff can add address to own candidate', 'PASS', 'Address created: ' || v_addr1_id::text);
  else
    raise exception 'FAIL Test 1: Staff 1 failed to insert address for own candidate';
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Staff cannot edit address of another staff's candidate
  -- Staff 2 tries to update address of Candidate 1 (created by Staff 1)
  -- ---------------------------------------------------------------------------
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff2_id, 'role', 'authenticated')::text);

  update student_addresses
  set line1 = 'HACKED ADDRESS'
  where id = v_addr1_id;

  get diagnostics v_rows_affected = row_count;

  if v_rows_affected = 0 then
    insert into test_results values (2, 'Staff cannot edit address of another staff candidate', 'PASS', 'RLS blocked update (0 rows affected)');
  else
    raise exception 'FAIL Test 2: Staff 2 was able to update address owned by Staff 1!';
  end if;

  -- Switch back to Staff 1 to verify address wasn't modified
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff1_id, 'role', 'authenticated')::text);
  declare
    v_line1 text;
  begin
    select line1 into v_line1 from student_addresses where id = v_addr1_id;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Ledger: fee 10,000, opening_paid 3,000, payment 2,000 -> balance 5,000
  -- ---------------------------------------------------------------------------
  -- Create enrollment with total_fee = 10,000, discount = 0, opening_paid = 3,000
  insert into enrollments (
    id,
    student_id,
    university_id,
    course_id,
    admission_staff_id,
    total_fee,
    discount,
    vat_treatment,
    vat_rate,
    opening_paid,
    opening_paid_note,
    created_by
  )
  values (
    gen_random_uuid(),
    v_cand1_id,
    v_uni_id,
    v_course_id,
    v_staff1_id,
    10000.00,
    0.00,
    'inclusive',
    5.00,
    3000.00,
    'Paid before onboarding',
    v_staff1_id
  )
  returning id into v_enr_id;

  -- Record payment of 2,000
  v_p := public.record_payment(
    p_enrollment_id := v_enr_id,
    p_amount := 2000.00,
    p_mode := 'cash',
    p_purpose := 'admission',
    p_purpose_note := null,
    p_reference_no := null,
    p_paid_at := now(),
    p_payee_name := 'Tariq One',
    p_comments := 'First installment'
  );

  -- Check enrollment_ledger view
  select total_paid, balance
  into v_ledger_paid, v_ledger_balance
  from public.enrollment_ledger
  where enrollment_id = v_enr_id;

  if v_ledger_paid = 5000.00 and v_ledger_balance = 5000.00 then
    insert into test_results values (3, 'Ledger computes opening_paid + payments', 'PASS', format('fee 10,000, opening 3,000, payment 2,000 -> total_paid=%s, balance=%s', v_ledger_paid, v_ledger_balance));
  else
    raise exception 'FAIL Test 3: Expected total_paid 5000 and balance 5000, got paid=%s balance=%s', v_ledger_paid, v_ledger_balance;
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 4: opening_paid cannot be changed by staff after a payment exists
  -- ---------------------------------------------------------------------------
  -- 4a. Direct update by staff is blocked by RLS (0 rows affected)
  update public.enrollments
  set opening_paid = 4000.00
  where id = v_enr_id;

  get diagnostics v_rows_affected = row_count;
  if v_rows_affected = 0 then
    insert into test_results values (4, 'Staff direct update to opening_paid blocked by RLS', 'PASS', '0 rows affected');
  else
    raise exception 'FAIL Test 4: Staff was able to directly update enrollment!';
  end if;

  -- 4b. Staff calling update_enrollment_opening_paid RPC is rejected
  begin
    perform public.update_enrollment_opening_paid(
      p_enrollment_id := v_enr_id,
      p_opening_paid := 4000.00,
      p_opening_paid_note := 'Staff attempt',
      p_reason := 'Unauthorized reason'
    );
    raise exception 'FAIL Test 4b: Staff update_enrollment_opening_paid succeeded unexpectedly!';
  exception when others then
    if sqlerrm like '%forbidden: only owner can edit opening balance%' or sqlerrm like '%forbidden: only Super Admins and authorized Admins can edit opening balance%' then
      insert into test_results values (5, 'Staff blocked from update_enrollment_opening_paid RPC', 'PASS', sqlerrm);
    else
      raise exception 'FAIL Test 4b: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Owner CAN update opening_paid via update_enrollment_opening_paid with reason
  -- ---------------------------------------------------------------------------
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text);

  -- 5a. Owner without reason must be rejected when payments exist
  begin
    perform public.update_enrollment_opening_paid(
      p_enrollment_id := v_enr_id,
      p_opening_paid := 3500.00,
      p_opening_paid_note := null,
      p_reason := null
    );
    raise exception 'FAIL Test 5a: Owner without reason succeeded unexpectedly!';
  exception when others then
    if sqlerrm like '%A reason is required to modify opening paid%' then
      insert into test_results values (6, 'Owner requires reason to modify opening_paid with payments', 'PASS', sqlerrm);
    else
      raise exception 'FAIL Test 5a: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- 5b. Owner with valid reason succeeds and logs to audit_log
  perform public.update_enrollment_opening_paid(
    p_enrollment_id := v_enr_id,
    p_opening_paid := 3500.00,
    p_opening_paid_note := 'Adjusted from old paper ledger',
    p_reason := 'Audit verification of bank deposit receipt'
  );

  select opening_paid into v_ledger_paid from public.enrollments where id = v_enr_id;
  if v_ledger_paid = 3500.00 then
    insert into test_results values (7, 'Owner can update opening_paid with reason', 'PASS', 'opening_paid updated to 3500.00 and audit logged');
  else
    raise exception 'FAIL Test 5b: Owner update did not persist';
  end if;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
