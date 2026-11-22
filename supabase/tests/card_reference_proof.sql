-- =============================================================================
-- Test Script: supabase/tests/card_reference_proof.sql
-- Verifies that:
-- 1. Card payment with no reference succeeds (stored as NULL)
-- 2. Card payment with reference passed succeeds and stores reference_no as NULL
-- 3. Link payment with no reference is rejected
-- 4. Link payment with reference succeeds and stores reference_no
-- 5. Bank transfer with no reference is rejected
-- 6. Bank transfer with reference succeeds and stores reference_no
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
  v_owner_id uuid := '00000000-0000-0000-0000-000000000099'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_res jsonb;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_pay_card payments;
  v_pay_card_extra payments;
  v_pay_link payments;
  v_pay_bank payments;
  v_err_msg text;
begin
  -- Setup test owner
  insert into auth.users (id, email)
  values (v_owner_id, 'test_card_ref_owner@edubridge.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active)
  values (v_owner_id, 'Card Ref Owner', 'owner', true)
  on conflict (id) do update set role = 'owner', is_active = true;

  -- Setup test masters
  select id into v_uni_id from public.universities where is_active = true limit 1;
  if v_uni_id is null then
    insert into public.universities (name, country) values ('Test Card Uni', 'UAE')
    returning id into v_uni_id;
  end if;

  select id into v_course_id from public.courses where is_active = true limit 1;
  if v_course_id is null then
    insert into public.courses (university_id, name, level) values (v_uni_id, 'Test Card Course', 'bachelor')
    returning id into v_course_id;
  end if;

  -- Switch context to authenticated owner
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Create candidate and enrollment
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'Test Card Ref Candidate',
    p_mobile := '+971501112233',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 15000.00,
    p_discount := 0.00,
    p_intake := 'Fall 2026'
  );
  v_student_id := (v_student_res->>'student_id')::uuid;
  v_enrollment_id := (v_student_res->>'enrollment_id')::uuid;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Card payment with NO reference succeeds and stores reference_no as NULL
  -- ---------------------------------------------------------------------------
  begin
    v_pay_card := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'card',
      p_purpose := 'admission',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Card Payee',
      p_comments := 'Card with no reference',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay_card.reference_no is null then
      insert into test_results values (1, 'Card payment with no reference', 'PASS', 'Succeeded with receipt_no=' || v_pay_card.receipt_no || ', reference_no is NULL');
    else
      insert into test_results values (1, 'Card payment with no reference', 'FAIL', 'Expected NULL reference_no, got: ' || v_pay_card.reference_no);
    end if;
  exception when others then
    insert into test_results values (1, 'Card payment with no reference', 'FAIL', 'Unexpected error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Card payment with reference passed still stores reference_no as NULL
  -- ---------------------------------------------------------------------------
  begin
    v_pay_card_extra := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'card',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := 'AUTH-IGNORED-1234',
      p_paid_at := now(),
      p_payee_name := 'Card Payee 2',
      p_comments := 'Card with reference ignored',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay_card_extra.reference_no is null then
      insert into test_results values (2, 'Card payment ignores reference and stores NULL', 'PASS', 'Succeeded with receipt_no=' || v_pay_card_extra.receipt_no || ', reference_no is NULL');
    else
      insert into test_results values (2, 'Card payment ignores reference and stores NULL', 'FAIL', 'Expected NULL reference_no, got: ' || v_pay_card_extra.reference_no);
    end if;
  exception when others then
    insert into test_results values (2, 'Card payment ignores reference and stores NULL', 'FAIL', 'Unexpected error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Payment link with NO reference is REJECTED
  -- ---------------------------------------------------------------------------
  begin
    v_pay_link := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'link',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Link Payee',
      p_comments := 'Link missing ref',
      p_idempotency_key := gen_random_uuid()
    );
    insert into test_results values (3, 'Payment link without reference is rejected', 'FAIL', 'Expected rejection, but payment succeeded');
  exception when others then
    v_err_msg := sqlerrm;
    if v_err_msg like '%Reference number is required for link payments%' then
      insert into test_results values (3, 'Payment link without reference is rejected', 'PASS', 'Correctly rejected: ' || v_err_msg);
    else
      insert into test_results values (3, 'Payment link without reference is rejected', 'FAIL', 'Unexpected error: ' || v_err_msg);
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Payment link WITH reference succeeds and stores reference_no
  -- ---------------------------------------------------------------------------
  begin
    v_pay_link := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'link',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := 'PLINK-987654',
      p_paid_at := now(),
      p_payee_name := 'Link Payee',
      p_comments := 'Link with valid ref',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay_link.reference_no = 'PLINK-987654' then
      insert into test_results values (4, 'Payment link with reference succeeds', 'PASS', 'Stored reference_no=' || v_pay_link.reference_no);
    else
      insert into test_results values (4, 'Payment link with reference succeeds', 'FAIL', 'Expected PLINK-987654, got: ' || coalesce(v_pay_link.reference_no, 'NULL'));
    end if;
  exception when others then
    insert into test_results values (4, 'Payment link with reference succeeds', 'FAIL', 'Unexpected error: ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Bank transfer with NO reference is REJECTED
  -- ---------------------------------------------------------------------------
  begin
    v_pay_bank := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'bank_transfer',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := '',
      p_paid_at := now(),
      p_payee_name := 'Bank Payee',
      p_comments := 'Bank transfer missing ref',
      p_idempotency_key := gen_random_uuid()
    );
    insert into test_results values (5, 'Bank transfer without reference is rejected', 'FAIL', 'Expected rejection, but payment succeeded');
  exception when others then
    v_err_msg := sqlerrm;
    if v_err_msg like '%Reference number is required for bank_transfer payments%' then
      insert into test_results values (5, 'Bank transfer without reference is rejected', 'PASS', 'Correctly rejected: ' || v_err_msg);
    else
      insert into test_results values (5, 'Bank transfer without reference is rejected', 'FAIL', 'Unexpected error: ' || v_err_msg);
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 6: Bank transfer WITH reference succeeds and stores reference_no
  -- ---------------------------------------------------------------------------
  begin
    v_pay_bank := public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 1000.00,
      p_mode := 'bank_transfer',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := 'WIRE-AE-112233',
      p_paid_at := now(),
      p_payee_name := 'Bank Payee',
      p_comments := 'Bank transfer with valid ref',
      p_idempotency_key := gen_random_uuid()
    );

    if v_pay_bank.reference_no = 'WIRE-AE-112233' then
      insert into test_results values (6, 'Bank transfer with reference succeeds', 'PASS', 'Stored reference_no=' || v_pay_bank.reference_no);
    else
      insert into test_results values (6, 'Bank transfer with reference succeeds', 'FAIL', 'Expected WIRE-AE-112233, got: ' || coalesce(v_pay_bank.reference_no, 'NULL'));
    end if;
  exception when others then
    insert into test_results values (6, 'Bank transfer with reference succeeds', 'FAIL', 'Unexpected error: ' || sqlerrm);
  end;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
