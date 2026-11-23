-- =============================================================================
-- Test Suite: supabase/tests/part4_students_proofs.sql
-- Runs in a transaction that always ROLLS BACK so no test data persists.
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
  v_uni_other uuid;
  v_course_other uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_res jsonb;
  v_count int;
  v_ledger_row record;
  v_rows_affected int;
  v_err_msg text;
begin
  -- ---------------------------------------------------------------------------
  -- SETUP
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, email)
  values
    (v_owner_id, 'owner_test@test.edubridge.local'),
    (v_staff1_id, 'staff1_test@test.edubridge.local'),
    (v_staff2_id, 'staff2_test@test.edubridge.local')
  on conflict (id) do nothing;

  insert into profiles (id, full_name, role, is_active)
  values
    (v_owner_id, 'Owner User', 'owner', true),
    (v_staff1_id, 'Staff One', 'staff', true),
    (v_staff2_id, 'Staff Two', 'staff', true)
  on conflict (id) do update
  set role = excluded.role, is_active = true;

  insert into universities (name, country, is_active)
  values ('Test Proof University A', 'UAE', true)
  returning id into v_uni_id;

  insert into courses (university_id, name, level, default_fee, is_active)
  values (v_uni_id, 'Test Proof Course A', 'Bachelor', 10000.00, true)
  returning id into v_course_id;

  insert into universities (name, country, is_active)
  values ('Test Proof University B', 'UAE', true)
  returning id into v_uni_other;

  insert into courses (university_id, name, level, default_fee, is_active)
  values (v_uni_other, 'Test Proof Course B', 'Master', 20000.00, true)
  returning id into v_course_other;

  -- ---------------------------------------------------------------------------
  -- PROOF 1: Staff cannot change an enrollment fee
  -- ---------------------------------------------------------------------------
  -- Create student & enrollment created by owner
  insert into students (id, full_name, mobile, email, created_by)
  values ('00000000-0000-0000-0000-000000000011'::uuid, 'Proof Student 1', '+971501111111', 's1@test.com', v_owner_id)
  returning id into v_student_id;

  insert into enrollments (id, student_id, university_id, course_id, admission_staff_id, total_fee, discount, created_by)
  values ('00000000-0000-0000-0000-000000000021'::uuid, v_student_id, v_uni_id, v_course_id, v_staff1_id, 10000.00, 1000.00, v_owner_id)
  returning id into v_enrollment_id;

  -- Switch to staff1
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

  -- A: Direct SQL update via RLS (enrollments_update requires is_owner())
  update enrollments set total_fee = 5000.00 where id = v_enrollment_id;
  get diagnostics v_rows_affected = row_count;

  -- B: Try RPC update_enrollment_fee as staff
  v_err_msg := null;
  begin
    perform public.update_enrollment_fee(v_enrollment_id, 5000.00, 0, 'staff discount');
  exception when others then
    v_err_msg := sqlerrm;
  end;

  if v_rows_affected = 0 and v_err_msg is not null and v_err_msg like '%forbidden%' then
    insert into test_results values (1, 'staff cannot change an enrollment fee', 'PASSED', 'RLS updated 0 rows; RPC threw: ' || v_err_msg);
  else
    insert into test_results values (1, 'staff cannot change an enrollment fee', 'FAILED', 'Rows: ' || v_rows_affected || '; Error: ' || coalesce(v_err_msg, 'none'));
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 2: Staff cannot edit another staff member''s student
  -- ---------------------------------------------------------------------------
  -- Switch back to superuser to create student owned by staff1
  set local role postgres;
  insert into students (id, full_name, mobile, email, notes, created_by)
  values ('00000000-0000-0000-0000-000000000012'::uuid, 'Staff1 Student', '+971502222222', 's2@test.com', 'Original notes', v_staff1_id);

  -- Switch to staff2
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';

  update students set notes = 'Tampered by staff 2' where id = '00000000-0000-0000-0000-000000000012'::uuid;
  get diagnostics v_rows_affected = row_count;

  -- Check if notes changed
  set local role postgres;
  select count(*) into v_count from students
  where id = '00000000-0000-0000-0000-000000000012'::uuid and notes = 'Original notes';

  if v_rows_affected = 0 and v_count = 1 then
    insert into test_results values (2, 'staff cannot edit another staff member''s student', 'PASSED', 'RLS blocked update; notes remained intact');
  else
    insert into test_results values (2, 'staff cannot edit another staff member''s student', 'FAILED', 'Rows affected: ' || v_rows_affected);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 3: create-student function leaves nothing behind if enrollment fails
  -- ---------------------------------------------------------------------------
  -- As staff1, try create_student_with_enrollment with mismatched course and uni
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

  v_err_msg := null;
  begin
    perform public.create_student_with_enrollment(
      p_full_name => 'Atomic Rollback Test Student',
      p_mobile => '+971509990001',
      p_whatsapp => '+971509990001',
      p_email => 'atomic@test.com',
      p_notes => 'Testing atomicity',
      p_university_id => v_uni_id,
      p_course_id => v_course_other, -- course belongs to university B, not A!
      p_specialization_id => null,
      p_total_fee => 10000.00,
      p_discount => 0,
      p_intake => 'Fall 2026',
      p_admission_staff_id => null
    );
  exception when others then
    v_err_msg := sqlerrm;
  end;

  -- Switch back to postgres and verify that no student was left behind
  set local role postgres;
  select count(*) into v_count from students where mobile = '+971509990001';

  if v_err_msg is not null and v_count = 0 then
    insert into test_results values (3, 'create-student function leaves nothing behind on failure', 'PASSED', 'Exception: "' || v_err_msg || '", students found with mobile: 0');
  else
    insert into test_results values (3, 'create-student function leaves nothing behind on failure', 'FAILED', 'Error: ' || coalesce(v_err_msg, 'none') || ', students found: ' || v_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 4: Ledger math: fee 10,000, discount 500, payments 3,000 + 2,000
  --          via record_payment -> enrollment_ledger balance = 4,500
  -- ---------------------------------------------------------------------------
  -- As owner, create student with fee 10,000 and discount 500
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

  v_res := public.create_student_with_enrollment(
    p_full_name => 'Ledger Math Student',
    p_mobile => '+971509990002',
    p_whatsapp => '+971509990002',
    p_email => 'math@test.com',
    p_notes => 'Ledger math verification',
    p_university_id => v_uni_id,
    p_course_id => v_course_id,
    p_specialization_id => null,
    p_total_fee => 10000.00,
    p_discount => 500.00,
    p_intake => 'Spring 2026',
    p_admission_staff_id => null
  );

  v_student_id := (v_res->>'student_id')::uuid;
  v_enrollment_id := (v_res->>'enrollment_id')::uuid;

  -- Record first payment: 3,000
  perform public.record_payment(
    p_enrollment_id => v_enrollment_id,
    p_amount => 3000.00,
    p_mode => 'cash',
    p_purpose => 'admission',
    p_purpose_note => null,
    p_reference_no => 'MATH-PAY-1',
    p_paid_at => now(),
    p_payee_name => 'Ledger Math Student',
    p_comments => 'First instalment',
    p_idempotency_key => gen_random_uuid()
  );

  -- Record second payment: 2,000
  perform public.record_payment(
    p_enrollment_id => v_enrollment_id,
    p_amount => 2000.00,
    p_mode => 'bank_transfer',
    p_purpose => 'repayment',
    p_purpose_note => null,
    p_reference_no => 'MATH-PAY-2',
    p_paid_at => now(),
    p_payee_name => 'Ledger Math Student',
    p_comments => 'Second instalment',
    p_idempotency_key => gen_random_uuid()
  );

  -- Query enrollment_ledger
  select * into v_ledger_row
  from public.enrollment_ledger
  where enrollment_id = v_enrollment_id;

  if v_ledger_row.total_fee = 10000.00
     and v_ledger_row.discount = 500.00
     and v_ledger_row.net_fee = 9500.00
     and v_ledger_row.total_paid = 5000.00
     and v_ledger_row.balance = 4500.00
     and v_ledger_row.payment_count = 2 then
    insert into test_results values (4, 'ledger math: fee 10,000 - discount 500 - payments 5,000 = balance 4,500', 'PASSED',
      format('total_fee=%s, discount=%s, net_fee=%s, total_paid=%s, balance=%s, count=%s',
        v_ledger_row.total_fee, v_ledger_row.discount, v_ledger_row.net_fee, v_ledger_row.total_paid, v_ledger_row.balance, v_ledger_row.payment_count));
  else
    insert into test_results values (4, 'ledger math', 'FAILED',
      format('balance=%s (expected 4500.00), total_paid=%s (expected 5000.00)', v_ledger_row.balance, v_ledger_row.total_paid));
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 5: Fee below total paid is blocked by SQL
  -- ---------------------------------------------------------------------------
  -- Total paid is 5,000. Try to set total_fee = 4,000 (discount 0) -> Net fee 4,000 < 5,000
  v_err_msg := null;
  begin
    perform public.update_enrollment_fee(v_enrollment_id, 4000.00, 0, 'Owner reducing fee below paid');
  exception when others then
    v_err_msg := sqlerrm;
  end;

  if v_err_msg is not null and v_err_msg like '%cannot be reduced below total already paid%' then
    insert into test_results values (5, 'fee below total paid is blocked by SQL verbatim', 'PASSED', 'SQL error: ' || v_err_msg);
  else
    insert into test_results values (5, 'fee below total paid is blocked by SQL verbatim', 'FAILED', 'Got: ' || coalesce(v_err_msg, 'no error'));
  end if;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
