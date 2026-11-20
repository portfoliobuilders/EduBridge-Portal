-- =============================================================================
-- Test Script: supabase/tests/rls_and_payments.sql
-- Verification of:
-- (1) staff cannot UPDATE payments
-- (2) staff cannot call void_payment
-- (3) record_payment rejects amount > balance
-- (4) two receipts in a row get consecutive numbers
-- (5) anon can call get_public_receipt but cannot SELECT any table
-- =============================================================================

do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_staff_id uuid := gen_random_uuid();
  v_uni_id uuid;
  v_course_id uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_payment1 payments;
  v_payment2 payments;
  v_receipt_no1 text;
  v_receipt_no2 text;
  v_num1 int;
  v_num2 int;
  v_public_json jsonb;
  v_test_passed boolean;
begin
  raise notice '=== STARTING RLS AND PAYMENTS VERIFICATION SUITE ===';

  -- Setup test users in profiles
  insert into auth.users (id, email)
  values (v_owner_id, 'test_owner@edubridge.test'),
         (v_staff_id, 'test_staff@edubridge.test')
  on conflict (id) do nothing;

  insert into profiles (id, full_name, role, is_active)
  values (v_owner_id, 'Test Owner', 'owner', true),
         (v_staff_id, 'Test Staff', 'staff', true)
  on conflict (id) do update set role = excluded.role, is_active = true;

  -- Setup University & Course
  insert into universities (name, country, is_active)
  values ('Test Verification University', 'UAE', true)
  returning id into v_uni_id;

  insert into courses (university_id, name, level, default_fee, is_active)
  values (v_uni_id, 'Test Verification Course', 'Bachelor', 10000.00, true)
  returning id into v_course_id;

  -- Create Student as staff
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into students (full_name, mobile, email, created_by)
  values ('Test Student One', '+971501112233', 'student1@test.com', v_staff_id)
  returning id into v_student_id;

  -- Create Enrollment: Total fee 10,000, discount 1,000 -> net fee 9,000
  insert into enrollments (student_id, university_id, course_id, admission_staff_id, total_fee, discount, created_by)
  values (v_student_id, v_uni_id, v_course_id, v_staff_id, 10000.00, 1000.00, v_staff_id)
  returning id into v_enrollment_id;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Two receipts in a row get consecutive numbers
  -- ---------------------------------------------------------------------------
  raise notice 'Testing Test 4: Consecutive receipt numbers...';
  v_payment1 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 2000.00,
    p_mode := 'cash',
    p_purpose := 'admission',
    p_purpose_note := null,
    p_reference_no := null,
    p_paid_at := now(),
    p_payee_name := 'Test Parent',
    p_comments := 'First installment'
  );
  v_receipt_no1 := v_payment1.receipt_no;

  v_payment2 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 1500.00,
    p_mode := 'card',
    p_purpose := 'repayment',
    p_purpose_note := null,
    p_reference_no := 'AUTH-998877',
    p_paid_at := now(),
    p_payee_name := 'Test Parent',
    p_comments := 'Second installment'
  );
  v_receipt_no2 := v_payment2.receipt_no;

  v_num1 := split_part(v_receipt_no1, '-', 4)::int;
  v_num2 := split_part(v_receipt_no2, '-', 4)::int;

  if (v_num2 - v_num1) = 1 then
    raise notice '✓ PASS Test 4: Consecutive numbers (% -> %)', v_receipt_no1, v_receipt_no2;
  else
    raise exception 'FAIL Test 4: Numbers are not consecutive (% -> %)', v_receipt_no1, v_receipt_no2;
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 3: record_payment rejects amount > balance
  -- Net fee = 9000. Paid so far = 2000 + 1500 = 3500. Remaining balance = 5500.
  -- Trying to pay 5501.00 should fail!
  -- ---------------------------------------------------------------------------
  raise notice 'Testing Test 3: Reject amount > balance...';
  begin
    perform public.record_payment(
      p_enrollment_id := v_enrollment_id,
      p_amount := 5501.00,
      p_mode := 'cash',
      p_purpose := 'repayment',
      p_purpose_note := null,
      p_reference_no := null,
      p_paid_at := now(),
      p_payee_name := 'Test Parent',
      p_comments := 'Overpayment test'
    );
    raise exception 'FAIL Test 3: Overpayment was NOT rejected!';
  exception when others then
    if sqlerrm like '%Amount exceeds balance%' then
      raise notice '✓ PASS Test 3: Overpayment properly rejected with message: %', sqlerrm;
    else
      raise exception 'FAIL Test 3: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Staff cannot UPDATE payments
  -- ---------------------------------------------------------------------------
  raise notice 'Testing Test 1: Staff cannot UPDATE payments...';
  -- Simulate staff direct update on payments
  update payments set amount = 9999.00 where id = v_payment1.id;
  -- Under RLS, update with no policy affects 0 rows
  select (amount = 2000.00) into v_test_passed from payments where id = v_payment1.id;
  if v_test_passed then
    raise notice '✓ PASS Test 1: Staff direct UPDATE on payments was blocked (amount unchanged).';
  else
    raise exception 'FAIL Test 1: Staff was able to UPDATE payments directly!';
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Staff cannot call void_payment
  -- ---------------------------------------------------------------------------
  raise notice 'Testing Test 2: Staff cannot call void_payment...';
  begin
    perform public.void_payment(v_payment1.id, 'Staff trying to void');
    raise exception 'FAIL Test 2: Staff was able to call void_payment!';
  exception when others then
    if sqlerrm like '%only owners can void receipts%' then
      raise notice '✓ PASS Test 2: void_payment correctly blocked staff: %', sqlerrm;
    else
      raise exception 'FAIL Test 2: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- Verify Owner CAN void payment
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  v_payment1 := public.void_payment(v_payment1.id, 'Owner authorized void reason');
  if v_payment1.status = 'void' and v_payment1.void_reason = 'Owner authorized void reason' then
    raise notice '✓ PASS Test 2b: Owner successfully voided receipt %', v_payment1.receipt_no;
  else
    raise exception 'FAIL Test 2b: Owner void failed!';
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Anon can call get_public_receipt but cannot SELECT any table
  -- ---------------------------------------------------------------------------
  raise notice 'Testing Test 5: Anon access rules...';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);

  -- Anon calling get_public_receipt
  v_public_json := public.get_public_receipt(v_payment2.share_token);
  if v_public_json is not null and (v_public_json->>'receipt_no') = v_payment2.receipt_no then
    raise notice '✓ PASS Test 5a: Anon successfully called get_public_receipt for %', v_payment2.receipt_no;
  else
    raise exception 'FAIL Test 5a: Anon could not retrieve public receipt!';
  end if;

  -- Anon attempting to select students table
  if not exists (select 1 from students where id = v_student_id) then
    raise notice '✓ PASS Test 5b: Anon cannot select students table (0 rows visible under RLS).';
  else
    raise exception 'FAIL Test 5b: Anon was able to select from students table!';
  end if;

  -- Anon attempting to select payments table
  if not exists (select 1 from payments where id = v_payment2.id) then
    raise notice '✓ PASS Test 5c: Anon cannot select payments table (0 rows visible under RLS).';
  else
    raise exception 'FAIL Test 5c: Anon was able to select from payments table!';
  end if;

  -- Clean up test records
  delete from payments where student_id = v_student_id;
  delete from enrollments where id = v_enrollment_id;
  delete from students where id = v_student_id;
  delete from courses where id = v_course_id;
  delete from universities where id = v_uni_id;
  delete from profiles where id in (v_owner_id, v_staff_id);
  delete from auth.users where id in (v_owner_id, v_staff_id);

  raise notice '=== ALL 5 RLS & PAYMENT TESTS PASSED SUCCESSFULLY! ===';
end $$;
