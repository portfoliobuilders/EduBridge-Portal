-- =============================================================================
-- Test Suite: supabase/tests/rls_and_payments.sql
-- Runs in a transaction that always ROLLS BACK so no test data persists.
-- Switches role with:
--   set local role authenticated; set local "request.jwt.claims" = '...';
-- and
--   set local role anon;
-- to genuinely test RLS and security boundaries without superuser bypass.
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
  v_staff_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_p1 payments;
  v_p2 payments;
  v_num1 int;
  v_num2 int;
  v_public_json jsonb;
  v_rows_affected int;
begin
  -- ---------------------------------------------------------------------------
  -- SETUP (run with current superuser/admin privileges)
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, email)
  values
    (v_owner_id, 'test_owner_rls@edubridge.test'),
    (v_staff_id, 'test_staff_rls@edubridge.test')
  on conflict (id) do nothing;

  insert into profiles (id, full_name, role, is_active)
  values
    (v_owner_id, 'Test Owner Admin', 'owner', true),
    (v_staff_id, 'Test Admissions Staff', 'staff', true)
  on conflict (id) do update
  set role = excluded.role, is_active = true;

  insert into universities (name, country, is_active)
  values ('RLS Test University', 'UAE', true)
  returning id into v_uni_id;

  insert into courses (university_id, name, level, default_fee, is_active)
  values (v_uni_id, 'RLS Test Course', 'Bachelor', 10000.00, true)
  returning id into v_course_id;

  insert into students (id, full_name, mobile, email, created_by)
  values ('00000000-0000-0000-0000-000000000010'::uuid, 'RLS Student', '+971509998877', 'student@test.com', v_staff_id)
  returning id into v_student_id;

  -- Enrollment: Total fee 10,000, discount 1,000 => net fee 9,000
  insert into enrollments (id, student_id, university_id, course_id, admission_staff_id, total_fee, discount, created_by)
  values ('00000000-0000-0000-0000-000000000020'::uuid, v_student_id, v_uni_id, v_course_id, v_staff_id, 10000.00, 1000.00, v_staff_id)
  returning id into v_enrollment_id;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Consecutive receipt numbers EB-RV-<year>-00001 then 00002
  -- ---------------------------------------------------------------------------
  -- Set identity to staff
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_id, 'role', 'authenticated')::text);

  v_p1 := public.record_payment(
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

  v_p2 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 1500.00,
    p_mode := 'card',
    p_purpose := 'repayment',
    p_purpose_note := null,
    p_reference_no := 'AUTH-12345',
    p_paid_at := now(),
    p_payee_name := 'Test Parent',
    p_comments := 'Second installment'
  );

  v_num1 := split_part(v_p1.receipt_no, '-', 4)::int;
  v_num2 := split_part(v_p2.receipt_no, '-', 4)::int;

  if (v_num2 - v_num1) = 1 then
    insert into test_results values (4, 'Consecutive receipt numbers', 'PASS', v_p1.receipt_no || ' -> ' || v_p2.receipt_no);
  else
    raise exception 'FAIL Test 4: Numbers are not consecutive (% -> %)', v_p1.receipt_no, v_p2.receipt_no;
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 3: record_payment rejects amount > balance
  -- Net fee = 9000, paid = 2000 + 1500 = 3500, balance = 5500.
  -- Paying 5501 must be rejected.
  -- ---------------------------------------------------------------------------
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
      p_comments := 'Overpayment attempt'
    );
    raise exception 'FAIL Test 3: Overpayment was NOT rejected';
  exception when others then
    if sqlerrm like '%Amount exceeds balance%' then
      insert into test_results values (3, 'Reject overpayment beyond balance', 'PASS', 'Attempt to pay balance + 1 correctly rejected: ' || sqlerrm);
    else
      raise exception 'FAIL Test 3: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Staff cannot UPDATE payments (enforced by RLS)
  -- ---------------------------------------------------------------------------
  -- Identity is authenticated staff
  update payments set amount = 99999.00 where id = v_p1.id;
  get diagnostics v_rows_affected = row_count;

  if v_rows_affected = 0 then
    insert into test_results values (1, 'Staff UPDATE on payments blocked (RLS)', 'PASS', '0 rows affected; direct update rejected by RLS');
  else
    raise exception 'FAIL Test 1: Staff was able to UPDATE payments! (% rows affected)', v_rows_affected;
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Staff cannot call void_payment; Owner can void
  -- ---------------------------------------------------------------------------
  begin
    perform public.void_payment(v_p1.id, 'Unauthorized staff attempt');
    raise exception 'FAIL Test 2: Staff was able to call void_payment!';
  exception when others then
    if sqlerrm like '%only owners can void receipts%' then
      null; -- expected
    else
      raise exception 'FAIL Test 2: Unexpected error: %', sqlerrm;
    end if;
  end;

  -- Verify Owner CAN void payment
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text);

  v_p1 := public.void_payment(v_p1.id, 'Authorized void by owner');
  if v_p1.status = 'void' then
    insert into test_results values (2, 'Staff void blocked; Owner void permitted', 'PASS', 'Staff blocked with exception; Owner voided payment ' || v_p1.receipt_no);
  else
    raise exception 'FAIL Test 2b: Owner void failed';
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Anon can call get_public_receipt but SELECT on payments/students returns 0
  -- ---------------------------------------------------------------------------
  execute 'set local role anon';
  execute 'set local "request.jwt.claims" = ''{"role":"anon"}''';

  -- Anon calls RPC get_public_receipt
  v_public_json := public.get_public_receipt(v_p2.share_token);
  if v_public_json is null or (v_public_json->>'receipt_no') != v_p2.receipt_no then
    raise exception 'FAIL Test 5a: Anon could not call get_public_receipt';
  end if;

  -- Anon attempts SELECT on students (should see 0 rows or be denied)
  begin
    select count(*) into v_rows_affected from students;
    if v_rows_affected != 0 then
      raise exception 'FAIL Test 5b: Anon was able to select % rows from students!', v_rows_affected;
    end if;
  exception when insufficient_privilege then
    null; -- Expected: table privileges revoked from anon
  end;

  -- Anon attempts SELECT on payments (should see 0 rows or be denied)
  begin
    select count(*) into v_rows_affected from payments;
    if v_rows_affected != 0 then
      raise exception 'FAIL Test 5c: Anon was able to select % rows from payments!', v_rows_affected;
    end if;
  exception when insufficient_privilege then
    null; -- Expected: table privileges revoked from anon
  end;

  insert into test_results values (5, 'Anon access rules (RPC works, SELECT blocked)', 'PASS', 'Public receipt accessible; 0 rows returned from students & payments');
end $$;

select test_no, test_name, status, detail from test_results order by test_no;

-- Transaction always rolls back so test accounts and receipts never persist
rollback;
