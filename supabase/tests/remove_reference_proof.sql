-- =============================================================================
-- Test Script: supabase/tests/remove_reference_proof.sql
-- Proof that payment reference field is COMPLETELY optional/ignored for ALL modes:
-- 1. Card payment with no reference succeeds (stored as NULL)
-- 2. Cash payment with no reference succeeds (stored as NULL)
-- 3. Payment link with no reference succeeds (stored as NULL)
-- 4. Bank transfer with no reference succeeds (stored as NULL)
-- 5. Payment passing dummy reference with any mode ignores it and stores NULL
--
-- Transaction is ALWAYS rolled back — no data persisted.
-- =============================================================================

begin;

create temp table test_results (
  test_no int,
  test_name text,
  status text,
  detail text
) on commit drop;

do $$
declare
  v_owner_id uuid := '00000000-0000-0000-0000-000000000098'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_res jsonb;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_pay payments;
begin
  -- Setup test owner
  insert into auth.users (id, email)
  values (v_owner_id, 'test_remove_ref_owner@edubridge.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active)
  values (v_owner_id, 'Remove Ref Owner', 'owner', true)
  on conflict (id) do update set role = 'owner', is_active = true;

  -- Setup test masters
  select id into v_uni_id from public.universities where is_active = true limit 1;
  if v_uni_id is null then
    insert into public.universities (name, country) values ('Test Ref Uni', 'UAE')
    returning id into v_uni_id;
  end if;

  select id into v_course_id from public.courses where is_active = true limit 1;
  if v_course_id is null then
    insert into public.courses (university_id, name, level) values (v_uni_id, 'Test Ref Course', 'bachelor')
    returning id into v_course_id;
  end if;

  -- Switch context to authenticated owner
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Create candidate and enrollment
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'Test Ref Candidate',
    p_mobile := '+971509998877',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 20000.00,
    p_discount := 0.00,
    p_intake := 'Fall 2026'
  );
  v_student_id := (v_student_res->>'student_id')::uuid;
  v_enrollment_id := (v_student_res->>'enrollment_id')::uuid;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Card payment with NO reference succeeds (stored as NULL)
  -- ---------------------------------------------------------------------------
  begin
    v_pay := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'card',
      p_purpose := 'admission',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Card Payee',
      p_comments := 'Card test',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay.reference_no is null then
      insert into test_results values (1, 'Card payment with no reference succeeds and stores NULL', 'PASS', 'Succeeded: receipt=' || v_pay.receipt_no || ', ref is NULL');
    else
      insert into test_results values (1, 'Card payment with no reference succeeds and stores NULL', 'FAIL', 'Expected NULL, got: ' || v_pay.reference_no);
    end if;
  exception when others then
    insert into test_results values (1, 'Card payment with no reference succeeds and stores NULL', 'FAIL', 'Error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Cash payment with NO reference succeeds (stored as NULL)
  -- ---------------------------------------------------------------------------
  begin
    v_pay := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'cash',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Cash Payee',
      p_comments := 'Cash test',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay.reference_no is null then
      insert into test_results values (2, 'Cash payment with no reference succeeds and stores NULL', 'PASS', 'Succeeded: receipt=' || v_pay.receipt_no || ', ref is NULL');
    else
      insert into test_results values (2, 'Cash payment with no reference succeeds and stores NULL', 'FAIL', 'Expected NULL, got: ' || v_pay.reference_no);
    end if;
  exception when others then
    insert into test_results values (2, 'Cash payment with no reference succeeds and stores NULL', 'FAIL', 'Error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Payment Link with NO reference succeeds (stored as NULL)
  -- ---------------------------------------------------------------------------
  begin
    v_pay := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'link',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Link Payee',
      p_comments := 'Link test with no ref',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay.reference_no is null then
      insert into test_results values (3, 'Payment Link with no reference succeeds and stores NULL', 'PASS', 'Succeeded: receipt=' || v_pay.receipt_no || ', ref is NULL');
    else
      insert into test_results values (3, 'Payment Link with no reference succeeds and stores NULL', 'FAIL', 'Expected NULL, got: ' || v_pay.reference_no);
    end if;
  exception when others then
    insert into test_results values (3, 'Payment Link with no reference succeeds and stores NULL', 'FAIL', 'Error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Bank Transfer with NO reference succeeds (stored as NULL)
  -- ---------------------------------------------------------------------------
  begin
    v_pay := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'bank_transfer',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Bank Payee',
      p_comments := 'Bank transfer with no ref',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay.reference_no is null then
      insert into test_results values (4, 'Bank Transfer with no reference succeeds and stores NULL', 'PASS', 'Succeeded: receipt=' || v_pay.receipt_no || ', ref is NULL');
    else
      insert into test_results values (4, 'Bank Transfer with no reference succeeds and stores NULL', 'FAIL', 'Expected NULL, got: ' || v_pay.reference_no);
    end if;
  exception when others then
    insert into test_results values (4, 'Bank Transfer with no reference succeeds and stores NULL', 'FAIL', 'Error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Dummy reference passed is ignored and stored as NULL
  -- ---------------------------------------------------------------------------
  begin
    v_pay := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'bank_transfer',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := 'DUMMY-REF-12345',
      p_paid_at := now(),
      p_payee_name := 'Bank Payee',
      p_comments := 'Bank transfer with dummy ref that should be ignored',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay.reference_no is null then
      insert into test_results values (5, 'Passed reference is ignored and stored as NULL', 'PASS', 'Succeeded: receipt=' || v_pay.receipt_no || ', ref stored as NULL');
    else
      insert into test_results values (5, 'Passed reference is ignored and stored as NULL', 'FAIL', 'Expected NULL, got: ' || v_pay.reference_no);
    end if;
  exception when others then
    insert into test_results values (5, 'Passed reference is ignored and stored as NULL', 'FAIL', 'Error: ' || sqlerrm);
  end;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
