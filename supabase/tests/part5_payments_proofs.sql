-- =============================================================================
-- Test Suite: supabase/tests/part5_payments_proofs.sql
-- Runs in a transaction that always ROLLS BACK so no test data persists.
-- =============================================================================

begin;

create temp table if not exists test_results (
  test_no int,
  test_name text,
  status text,
  detail text
) on commit drop;

do $$
declare
  v_user_id uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_res1 jsonb;
  v_res2 jsonb;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_student_code text;
  v_err_msg text;
  v_idem_key uuid := gen_random_uuid();
  v_pay1 payments;
  v_pay2 payments;
  v_pay_count int;
  v_ledger record;
begin
  -- ---------------------------------------------------------------------------
  -- SETUP: Use existing active owner/user and existing active uni & course
  -- ---------------------------------------------------------------------------
  select id into v_user_id from public.profiles where is_active = true and role in ('super_admin', 'owner') limit 1;
  if v_user_id is null then
    select id into v_user_id from public.profiles where is_active = true limit 1;
  end if;

  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where is_active = true and university_id = v_uni_id limit 1;

  if v_uni_id is null or v_course_id is null then
    -- Fallback to any course
    select university_id, id into v_uni_id, v_course_id from public.courses where is_active = true limit 1;
  end if;

  -- Set authenticated context
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------------------
  -- TEST 1: Duplicate Student Guard (same mobile AND same case-insensitive name)
  -- ---------------------------------------------------------------------------
  v_res1 := public.create_student_with_enrollment(
    p_full_name := 'Test Duplicate Student',
    p_mobile := '+971509998881',
    p_whatsapp := '+971509998881',
    p_email := 'dup.test@edubridge.test',
    p_notes := 'Initial student',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_specialization_id := null,
    p_total_fee := 5000,
    p_discount := 0,
    p_intake := 'Sep 2026',
    p_admission_staff_id := v_user_id
  );
  v_student_code := v_res1->>'student_code';

  begin
    v_res2 := public.create_student_with_enrollment(
      p_full_name := '  test duplicate student  ',
      p_mobile := '+971509998881',
      p_university_id := v_uni_id,
      p_course_id := v_course_id,
      p_total_fee := 5000
    );
    insert into test_results values (1, 'Duplicate student rejection', 'FAIL', 'Expected exception not raised');
  exception when others then
    v_err_msg := sqlerrm;
    if v_err_msg like 'Student already exists: ' || v_student_code then
      insert into test_results values (1, 'Duplicate student rejection', 'PASS', 'Correctly rejected: ' || v_err_msg);
    else
      insert into test_results values (1, 'Duplicate student rejection', 'FAIL', 'Unexpected error: ' || v_err_msg);
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Sibling creation (same mobile, different name) MUST succeed
  -- ---------------------------------------------------------------------------
  begin
    v_res2 := public.create_student_with_enrollment(
      p_full_name := 'Test Sibling Student',
      p_mobile := '+971509998881',
      p_university_id := v_uni_id,
      p_course_id := v_course_id,
      p_total_fee := 6000
    );
    if v_res2->>'student_id' is not null and (v_res2->>'student_code') != v_student_code then
      insert into test_results values (2, 'Sibling allowed with same mobile', 'PASS', 'Created sibling code: ' || (v_res2->>'student_code'));
    else
      insert into test_results values (2, 'Sibling allowed with same mobile', 'FAIL', 'Failed to create sibling');
    end if;
  exception when others then
    insert into test_results values (2, 'Sibling allowed with same mobile', 'FAIL', 'Error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Idempotent record_payment RPC
  -- ---------------------------------------------------------------------------
  v_enrollment_id := (v_res1->>'enrollment_id')::uuid;

  -- First payment
  v_pay1 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 1500.00,
    p_mode := 'cash'::payment_mode,
    p_purpose := 'admission'::payment_purpose,
    p_purpose_note := null,
    p_reference_no := null,
    p_paid_at := now(),
    p_payee_name := 'Test Duplicate Student',
    p_comments := 'First payment',
    p_idempotency_key := v_idem_key
  );

  -- Second payment with same idempotency key
  v_pay2 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 1500.00,
    p_mode := 'cash'::payment_mode,
    p_purpose := 'admission'::payment_purpose,
    p_purpose_note := null,
    p_reference_no := null,
    p_paid_at := now(),
    p_payee_name := 'Test Duplicate Student',
    p_comments := 'Duplicate call with same key',
    p_idempotency_key := v_idem_key
  );

  select count(*) into v_pay_count from public.payments where enrollment_id = v_enrollment_id and status = 'valid';

  if v_pay1.id = v_pay2.id and v_pay_count = 1 then
    insert into test_results values (3, 'Idempotent payment creation', 'PASS', 'Returned existing payment id ' || v_pay1.id || ', payment count remains 1');
  else
    insert into test_results values (3, 'Idempotent payment creation', 'FAIL', 'Mismatch: pay1=' || v_pay1.id || ', pay2=' || v_pay2.id || ', count=' || v_pay_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 4: VAT-Exclusive Ledger Calculation (Fee 10,000 -> Payable 10,500)
  -- ---------------------------------------------------------------------------
  update public.company_settings set vat_enabled = true;

  v_res2 := public.create_student_with_enrollment(
    p_full_name := 'Test VAT Exclusive Student',
    p_mobile := '+971509998882',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0,
    p_vat_type := 'exclusive',
    p_vat_rate := 5.00
  );
  v_enrollment_id := (v_res2->>'enrollment_id')::uuid;

  select * into v_ledger from public.enrollment_ledger where enrollment_id = v_enrollment_id;

  if v_ledger.net_fee = 10000.00 and v_ledger.vat_amount = 500.00 and v_ledger.total_payable = 10500.00 and v_ledger.balance = 10500.00 then
    insert into test_results values (4, 'VAT Exclusive 10,000 -> 10,500', 'PASS',
      'net_fee=' || v_ledger.net_fee || ', vat_amount=' || v_ledger.vat_amount || ', total_payable=' || v_ledger.total_payable || ', balance=' || v_ledger.balance);
  else
    insert into test_results values (4, 'VAT Exclusive 10,000 -> 10,500', 'FAIL',
      'Values: net_fee=' || v_ledger.net_fee || ', vat=' || v_ledger.vat_amount || ', total_payable=' || v_ledger.total_payable || ', balance=' || v_ledger.balance);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Overpayment guard respects VAT-Exclusive total payable
  -- ---------------------------------------------------------------------------
  begin
    v_pay1 := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 10500.01,
      p_mode := 'cash'::payment_mode,
      p_purpose := 'repayment'::payment_purpose,
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Test VAT Exclusive Student',
      p_comments := null,
      p_idempotency_key := gen_random_uuid()
    );
    insert into test_results values (5, 'Overpayment guard on VAT-Exclusive', 'FAIL', 'Overpayment should have been blocked');
  exception when others then
    v_err_msg := sqlerrm;
    if v_err_msg like 'Amount exceeds balance of AED 10,500.00%' then
      insert into test_results values (5, 'Overpayment guard on VAT-Exclusive', 'PASS', 'Correctly rejected: ' || v_err_msg);
    else
      insert into test_results values (5, 'Overpayment guard on VAT-Exclusive', 'FAIL', 'Unexpected error: ' || v_err_msg);
    end if;
  end;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
