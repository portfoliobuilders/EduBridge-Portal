-- =============================================================================
-- Test Suite: supabase/tests/idempotency_proof.sql
-- Proof: Same idempotency_key submitted twice -> exactly one payment row.
-- Runs in a transaction that always ROLLS BACK so no test data persists.
-- =============================================================================

begin;

create temp table if not exists idempotency_proof_results (
  step text,
  payment_id uuid,
  receipt_no text,
  payment_rows_count int,
  status text
) on commit drop;

grant all on idempotency_proof_results to authenticated;

do $$
declare
  v_staff_id uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_idem_key uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;
  v_pay1 payments;
  v_pay2 payments;
  v_count int;
begin
  -- Select an existing active profile
  select id into v_staff_id from public.profiles where is_active = true limit 1;

  -- Setup university, course, student, enrollment
  insert into universities (name, country, is_active)
  values ('Idempotency Test University', 'UAE', true)
  returning id into v_uni_id;

  insert into courses (university_id, name, level, default_fee, is_active)
  values (v_uni_id, 'Idempotency Test Course', 'Bachelor', 10000.00, true)
  returning id into v_course_id;

  insert into students (full_name, mobile, email, created_by)
  values ('Idempotency Student', '+971501239999', 'idem@test.com', v_staff_id)
  returning id into v_student_id;

  insert into enrollments (student_id, university_id, course_id, admission_staff_id, total_fee, discount, created_by)
  values (v_student_id, v_uni_id, v_course_id, v_staff_id, 10000.00, 0, v_staff_id)
  returning id into v_enrollment_id;

  -- Switch to authenticated staff
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_id, 'role', 'authenticated')::text);

  -- Call 1: First payment submission
  v_pay1 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 2500.00,
    p_mode := 'card'::payment_mode,
    p_purpose := 'admission'::payment_purpose,
    p_purpose_note := null,
    p_reference_no := 'AUTH-IDEM-001',
    p_paid_at := now(),
    p_payee_name := 'Idempotency Student',
    p_comments := 'First submission',
    p_idempotency_key := v_idem_key
  );

  select count(*) into v_count from public.payments where idempotency_key = v_idem_key;
  insert into idempotency_proof_results values ('1. First Submission', v_pay1.id, v_pay1.receipt_no, v_count, 'Payment row created');

  -- Call 2: Second submission with the exact same idempotency_key
  v_pay2 := public.record_payment(
    p_enrollment_id := v_enrollment_id,
    p_amount := 2500.00,
    p_mode := 'card'::payment_mode,
    p_purpose := 'admission'::payment_purpose,
    p_purpose_note := null,
    p_reference_no := 'AUTH-IDEM-001',
    p_paid_at := now(),
    p_payee_name := 'Idempotency Student',
    p_comments := 'Second submission duplicate network retry',
    p_idempotency_key := v_idem_key
  );

  select count(*) into v_count from public.payments where idempotency_key = v_idem_key;
  
  if v_pay1.id = v_pay2.id and v_count = 1 then
    insert into idempotency_proof_results values ('2. Second Submission (Duplicate Key)', v_pay2.id, v_pay2.receipt_no, v_count, 'PASS: Returned identical row, count remains exactly 1');
  else
    insert into idempotency_proof_results values ('2. Second Submission (Duplicate Key)', v_pay2.id, v_pay2.receipt_no, v_count, 'FAIL: Duplicate row created or ID mismatch');
  end if;
end $$;

select step, payment_id, receipt_no, payment_rows_count, status from idempotency_proof_results;

rollback;
