-- =============================================================================
-- Test Suite: supabase/tests/token_rpc_proof.sql
-- Verifies the REAL RPCs:
-- 1. rotate_receipt_share_token
-- 2. toggle_receipt_share_enabled
-- 3. rotate_enrollment_share_token
-- 4. set_enrollment_share_enabled
-- Under 4 distinct identities:
--   a) Owner -> SUCCESS
--   b) Receiving / Admission Staff -> SUCCESS
--   c) Other Staff -> FORBIDDEN / EXCEPTION
--   d) Anon -> PERMISSION DENIED / EXCEPTION
--
-- ALWAYS rolls back — never persists data.
-- =============================================================================

begin;

create temp table test_results (
  test_no int,
  test_name text,
  status text,
  detail text
) on commit drop;

grant all on test_results to authenticated, anon;

do $$
declare
  v_owner_id uuid := '00000000-0000-0000-0000-000000000010'::uuid;
  v_receiving_staff_id uuid := '00000000-0000-0000-0000-000000000020'::uuid;
  v_other_staff_id uuid := '00000000-0000-0000-0000-000000000030'::uuid;

  v_uni_id uuid;
  v_course_id uuid;
  v_student_res jsonb;
  v_enrollment_id uuid;
  v_payment payments;
  v_new_token uuid;
  v_status_bool boolean;
  v_err_caught boolean;
begin
  -- 1. Identity setup
  insert into auth.users (id, email)
  values
    (v_owner_id, 'test_token_owner@edubridge.test'),
    (v_receiving_staff_id, 'test_token_staff_rec@edubridge.test'),
    (v_other_staff_id, 'test_token_staff_oth@edubridge.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active)
  values
    (v_owner_id, 'Token Test Owner', 'owner', true),
    (v_receiving_staff_id, 'Token Test Receiving Staff', 'staff', true),
    (v_other_staff_id, 'Token Test Other Staff', 'staff', true)
  on conflict (id) do update set role = excluded.role, is_active = true;

  -- 2. Masters & student setup
  select id into v_uni_id from public.universities where is_active = true limit 1;
  if v_uni_id is null then
    insert into public.universities (name, country) values ('Token Test Uni', 'UAE')
    returning id into v_uni_id;
  end if;

  select id into v_course_id from public.courses where is_active = true limit 1;
  if v_course_id is null then
    insert into public.courses (university_id, name, level) values (v_uni_id, 'Token Test Course', 'bachelor')
    returning id into v_course_id;
  end if;

  -- Set identity to receiving_staff
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_receiving_staff_id, 'role', 'authenticated')::text);

  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'Token Test Candidate',
    p_mobile := '+971509990001',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_intake := 'Spring 2026'
  );
  v_enrollment_id := (v_student_res->>'enrollment_id')::uuid;

  -- Record payment by receiving_staff
  v_payment := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 2000.00,
    p_mode := 'cash',
    p_purpose := 'admission',
    p_purpose_note := null,
    p_reference_no := null,
    p_paid_at := now(),
    p_payee_name := 'Token Test Candidate',
    p_comments := null,
    p_idempotency_key := gen_random_uuid()
  );

  -- ---------------------------------------------------------------------------
  -- TEST 1: rotate_receipt_share_token as RECEIVING STAFF -> SUCCESS
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_receiving_staff_id, 'role', 'authenticated')::text);
  v_new_token := public.rotate_receipt_share_token(v_payment.id);
  if v_new_token is not null and v_new_token != v_payment.share_token then
    insert into test_results values (1, 'Receiving staff rotate receipt token', 'PASS', 'New token generated: ' || v_new_token);
  else
    insert into test_results values (1, 'Receiving staff rotate receipt token', 'FAIL', 'Token not rotated properly');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: rotate_receipt_share_token as OWNER -> SUCCESS
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text);
  v_new_token := public.rotate_receipt_share_token(v_payment.id);
  if v_new_token is not null then
    insert into test_results values (2, 'Owner rotate receipt token', 'PASS', 'Owner rotated token successfully: ' || v_new_token);
  else
    insert into test_results values (2, 'Owner rotate receipt token', 'FAIL', 'Owner rotate returned null');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 3: rotate_receipt_share_token as OTHER STAFF -> FORBIDDEN
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_other_staff_id, 'role', 'authenticated')::text);
  v_err_caught := false;
  begin
    perform public.rotate_receipt_share_token(v_payment.id);
  exception when others then
    v_err_caught := true;
    insert into test_results values (3, 'Other staff rotate receipt token blocked', 'PASS', 'Correctly rejected: ' || sqlerrm);
  end;
  if not v_err_caught then
    insert into test_results values (3, 'Other staff rotate receipt token blocked', 'FAIL', 'Other staff was able to rotate token!');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 4: toggle_receipt_share_enabled as RECEIVING STAFF -> SUCCESS
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_receiving_staff_id, 'role', 'authenticated')::text);
  v_status_bool := public.toggle_receipt_share_enabled(v_payment.id, false);
  if v_status_bool = false then
    insert into test_results values (4, 'Receiving staff toggle receipt share enabled', 'PASS', 'Disabled share successfully');
  else
    insert into test_results values (4, 'Receiving staff toggle receipt share enabled', 'FAIL', 'Did not return false');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: toggle_receipt_share_enabled as OTHER STAFF -> FORBIDDEN
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_other_staff_id, 'role', 'authenticated')::text);
  v_err_caught := false;
  begin
    perform public.toggle_receipt_share_enabled(v_payment.id, true);
  exception when others then
    v_err_caught := true;
    insert into test_results values (5, 'Other staff toggle receipt share blocked', 'PASS', 'Correctly rejected: ' || sqlerrm);
  end;
  if not v_err_caught then
    insert into test_results values (5, 'Other staff toggle receipt share blocked', 'FAIL', 'Other staff was able to toggle receipt share!');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 6: rotate_enrollment_share_token as ADMISSION STAFF -> SUCCESS
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_receiving_staff_id, 'role', 'authenticated')::text);
  v_new_token := public.rotate_enrollment_share_token(v_enrollment_id);
  if v_new_token is not null then
    insert into test_results values (6, 'Admission staff rotate enrollment token', 'PASS', 'New enrollment token: ' || v_new_token);
  else
    insert into test_results values (6, 'Admission staff rotate enrollment token', 'FAIL', 'Failed to rotate enrollment token');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 7: rotate_enrollment_share_token as OTHER STAFF -> FORBIDDEN
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_other_staff_id, 'role', 'authenticated')::text);
  v_err_caught := false;
  begin
    perform public.rotate_enrollment_share_token(v_enrollment_id);
  exception when others then
    v_err_caught := true;
    insert into test_results values (7, 'Other staff rotate enrollment token blocked', 'PASS', 'Correctly rejected: ' || sqlerrm);
  end;
  if not v_err_caught then
    insert into test_results values (7, 'Other staff rotate enrollment token blocked', 'FAIL', 'Other staff rotated enrollment token!');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 8: set_enrollment_share_enabled as OWNER -> SUCCESS
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text);
  v_status_bool := public.set_enrollment_share_enabled(v_enrollment_id, false);
  if v_status_bool = false then
    insert into test_results values (8, 'Owner set enrollment share disabled', 'PASS', 'Disabled statement share successfully');
  else
    insert into test_results values (8, 'Owner set enrollment share disabled', 'FAIL', 'Failed to disable statement share');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 9: set_enrollment_share_enabled as OTHER STAFF -> FORBIDDEN
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_other_staff_id, 'role', 'authenticated')::text);
  v_err_caught := false;
  begin
    perform public.set_enrollment_share_enabled(v_enrollment_id, true);
  exception when others then
    v_err_caught := true;
    insert into test_results values (9, 'Other staff set enrollment share blocked', 'PASS', 'Correctly rejected: ' || sqlerrm);
  end;
  if not v_err_caught then
    insert into test_results values (9, 'Other staff set enrollment share blocked', 'FAIL', 'Other staff set enrollment share!');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 10: Anon identity cannot call these RPCs
  -- ---------------------------------------------------------------------------
  execute 'set local role anon';
  execute format('set local "request.jwt.claims" = %L', json_build_object('role', 'anon')::text);

  v_err_caught := false;
  begin
    perform public.rotate_receipt_share_token(v_payment.id);
  exception when others then
    v_err_caught := true;
  end;
  if v_err_caught then
    insert into test_results values (10, 'Anon call rotate_receipt_share_token denied', 'PASS', 'Anon denied as expected');
  else
    insert into test_results values (10, 'Anon call rotate_receipt_share_token denied', 'FAIL', 'Anon was permitted to rotate receipt token!');
  end if;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
