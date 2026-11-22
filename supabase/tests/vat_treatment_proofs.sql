-- =============================================================================
-- Test Suite: VAT Treatment System Proofs
-- Tests all 11 requirements from spec inside a safe BEGIN...ROLLBACK block:
-- 1. Exclusive 10,000 -> payable 10,500, VAT 500
-- 2. Inclusive 10,000 -> VAT 476.19, taxable 9,523.81
-- 3. None -> VAT 0
-- 4. Discount 1,000 on exclusive 10,000 -> payable 9,450
-- 5. Three payments on exclusive (3,000 + 3,000 + 4,500) -> per-receipt VAT sums exactly to 500.00
-- 6. opening_paid case sums exactly
-- 7. Overpayment beyond total_payable rejected
-- 8. Treatment change after payment rejected by lock trigger
-- 9. Fee edit keeps total_payable floor
-- 10. vat_enabled = false -> new enrollment forced to 'none'
-- 11. Void excludes VAT from totals
-- =============================================================================

begin;

create temp table vat_proof_results (
  test_no int,
  test_name text,
  status text,
  details text
);

do $$
declare
  v_staff_id uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_student_res jsonb;
  v_stu_id uuid;
  v_enr_id uuid;
  v_ledger record;
  v_p1 payments;
  v_p2 payments;
  v_p3 payments;
  v_vat_sum numeric(12,2);
  v_err_caught boolean;
  v_err_msg text;
  v_comp_orig_vat boolean;
  v_opening_vat numeric(12,2);
begin
  -- Setup test actor and university/course
  select id into v_staff_id from public.profiles where role in ('super_admin', 'owner') and is_active = true limit 1;
  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where university_id = v_uni_id and is_active = true limit 1;

  -- Set authenticated context
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------------------
  -- PROOF 1: Exclusive 10,000 -> payable 10,500, VAT 500
  -- ---------------------------------------------------------------------------
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 1',
    p_mobile := '+971500000001',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'exclusive',
    p_vat_rate := 5.00
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  select * into v_ledger from public.enrollment_ledger where enrollment_id = v_enr_id;
  if v_ledger.total_payable = 10500.00 and v_ledger.vat_total = 500.00 and v_ledger.taxable = 10000.00 and v_ledger.balance = 10500.00 then
    insert into vat_proof_results values (1, 'Exclusive 10,000 -> payable 10,500, VAT 500', 'PASS',
      'total_payable=' || v_ledger.total_payable || ', vat_total=' || v_ledger.vat_total || ', taxable=' || v_ledger.taxable);
  else
    insert into vat_proof_results values (1, 'Exclusive 10,000 -> payable 10,500, VAT 500', 'FAIL',
      'Got: total_payable=' || v_ledger.total_payable || ', vat_total=' || v_ledger.vat_total);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 2: Inclusive 10,000 -> VAT 476.19, taxable 9,523.81
  -- ---------------------------------------------------------------------------
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 2',
    p_mobile := '+971500000002',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'inclusive',
    p_vat_rate := 5.00
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  select * into v_ledger from public.enrollment_ledger where enrollment_id = v_enr_id;
  if v_ledger.total_payable = 10000.00 and v_ledger.vat_total = 476.19 and v_ledger.taxable = 9523.81 then
    insert into vat_proof_results values (2, 'Inclusive 10,000 -> VAT 476.19, taxable 9,523.81', 'PASS',
      'total_payable=' || v_ledger.total_payable || ', vat_total=' || v_ledger.vat_total || ', taxable=' || v_ledger.taxable);
  else
    insert into vat_proof_results values (2, 'Inclusive 10,000 -> VAT 476.19, taxable 9,523.81', 'FAIL',
      'Got: vat_total=' || v_ledger.vat_total || ', taxable=' || v_ledger.taxable);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 3: None -> VAT 0, taxable 10,000, payable 10,000
  -- ---------------------------------------------------------------------------
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 3',
    p_mobile := '+971500000003',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'none',
    p_vat_rate := 5.00,
    p_no_vat_reason := 'zero_rated'
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  select * into v_ledger from public.enrollment_ledger where enrollment_id = v_enr_id;
  if v_ledger.total_payable = 10000.00 and v_ledger.vat_total = 0.00 and v_ledger.taxable = 10000.00 then
    insert into vat_proof_results values (3, 'None -> VAT 0, taxable 10,000, payable 10,000', 'PASS',
      'total_payable=' || v_ledger.total_payable || ', vat_total=' || v_ledger.vat_total);
  else
    insert into vat_proof_results values (3, 'None -> VAT 0, taxable 10,000, payable 10,000', 'FAIL',
      'Got: vat_total=' || v_ledger.vat_total);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 4: Discount 1,000 on exclusive 10,000 -> payable 9,450
  -- ---------------------------------------------------------------------------
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 4',
    p_mobile := '+971500000004',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 1000.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'exclusive',
    p_vat_rate := 5.00
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  select * into v_ledger from public.enrollment_ledger where enrollment_id = v_enr_id;
  if v_ledger.net_fee = 9000.00 and v_ledger.vat_total = 450.00 and v_ledger.total_payable = 9450.00 then
    insert into vat_proof_results values (4, 'Discount 1,000 on exclusive 10,000 -> payable 9,450', 'PASS',
      'net_fee=' || v_ledger.net_fee || ', vat_total=' || v_ledger.vat_total || ', total_payable=' || v_ledger.total_payable);
  else
    insert into vat_proof_results values (4, 'Discount 1,000 on exclusive 10,000 -> payable 9,450', 'FAIL',
      'Got: total_payable=' || v_ledger.total_payable);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 5: Three payments on exclusive (3,000 + 3,000 + 4,500) -> per-receipt VAT sums exactly to 500.00
  -- ---------------------------------------------------------------------------
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 5',
    p_mobile := '+971500000005',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'exclusive',
    p_vat_rate := 5.00
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  v_p1 := public.record_payment(v_enr_id, 3000.00, 'cash', 'admission', null, null, now(), 'Student 5', 'p1');
  v_p2 := public.record_payment(v_enr_id, 3000.00, 'card', 'admission', null, null, now(), 'Student 5', 'p2');
  v_p3 := public.record_payment(v_enr_id, 4500.00, 'bank_transfer', 'admission', null, null, now(), 'Student 5', 'p3');

  v_vat_sum := v_p1.vat_amount + v_p2.vat_amount + v_p3.vat_amount;
  if v_p1.vat_amount = 142.86 and v_p2.vat_amount = 142.86 and v_p3.vat_amount = 214.28 and v_vat_sum = 500.00 then
    insert into vat_proof_results values (5, 'Three payments (3000+3000+4500) VAT sums exactly to 500.00', 'PASS',
      'p1=' || v_p1.vat_amount || ', p2=' || v_p2.vat_amount || ', p3=' || v_p3.vat_amount || ', sum=' || v_vat_sum);
  else
    insert into vat_proof_results values (5, 'Three payments (3000+3000+4500) VAT sums exactly to 500.00', 'FAIL',
      'p1=' || v_p1.vat_amount || ', p2=' || v_p2.vat_amount || ', p3=' || v_p3.vat_amount || ', sum=' || v_vat_sum);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 6: opening_paid case sums exactly
  -- ---------------------------------------------------------------------------
  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 6',
    p_mobile := '+971500000006',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'exclusive',
    p_vat_rate := 5.00,
    p_opening_paid := 2500.00
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  v_opening_vat := round(2500.00 * 5.00 / 105.00, 2); -- 119.05
  v_p1 := public.record_payment(v_enr_id, 4000.00, 'cash', 'admission', null, null, now(), 'Student 6', 'p1'); -- vat: 190.48
  v_p2 := public.record_payment(v_enr_id, 4000.00, 'card', 'admission', null, null, now(), 'Student 6', 'p2'); -- brings to 0 -> 500 - 119.05 - 190.48 = 190.47

  v_vat_sum := v_opening_vat + v_p1.vat_amount + v_p2.vat_amount;
  if v_p2.vat_amount = 190.47 and v_vat_sum = 500.00 then
    insert into vat_proof_results values (6, 'Opening paid case sums exactly to 500.00', 'PASS',
      'opening_vat=' || v_opening_vat || ', p1=' || v_p1.vat_amount || ', p2=' || v_p2.vat_amount || ', total=' || v_vat_sum);
  else
    insert into vat_proof_results values (6, 'Opening paid case sums exactly to 500.00', 'FAIL',
      'p2=' || v_p2.vat_amount || ', total=' || v_vat_sum);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 7: Overpayment beyond total_payable rejected
  -- ---------------------------------------------------------------------------
  v_err_caught := false;
  begin
    perform public.record_payment(v_enr_id, 10.00, 'cash', 'admission', null, null, now(), 'Student 6', 'overpay');
  exception when others then
    v_err_caught := true;
    v_err_msg := sqlerrm;
  end;

  if v_err_caught and v_err_msg like '%Amount exceeds balance%' then
    insert into vat_proof_results values (7, 'Overpayment beyond total_payable rejected', 'PASS', 'Correctly rejected: ' || v_err_msg);
  else
    insert into vat_proof_results values (7, 'Overpayment beyond total_payable rejected', 'FAIL', 'Overpayment was not rejected');
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 8: Treatment change after payment rejected
  -- ---------------------------------------------------------------------------
  v_err_caught := false;
  begin
    update public.enrollments
    set vat_treatment = 'inclusive'
    where id = v_enr_id;
  exception when others then
    v_err_caught := true;
    v_err_msg := sqlerrm;
  end;

  if v_err_caught and v_err_msg like '%VAT treatment and VAT rate cannot be changed once valid payments exist%' then
    insert into vat_proof_results values (8, 'Treatment change after payment rejected', 'PASS', 'Trigger blocked change: ' || v_err_msg);
  else
    insert into vat_proof_results values (8, 'Treatment change after payment rejected', 'FAIL', 'Failed to block change: ' || coalesce(v_err_msg, 'no error'));
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 9: Fee edit keeps floor
  -- ---------------------------------------------------------------------------
  v_err_caught := false;
  begin
    -- v_enr_id has total_paid = 10,500.00 (2500 opening + 4000 + 4000). Trying to set total_fee to 5,000 (total_payable 5,250 < 10,500) must fail!
    perform public.update_enrollment_fee(v_enr_id, 5000.00, 0.00, 'Attempt fee below total paid');
  exception when others then
    v_err_caught := true;
    v_err_msg := sqlerrm;
  end;

  if v_err_caught and v_err_msg like '%cannot be reduced below total already paid%' then
    insert into vat_proof_results values (9, 'Fee edit keeps total_payable floor', 'PASS', 'Correctly rejected: ' || v_err_msg);
  else
    insert into vat_proof_results values (9, 'Fee edit keeps total_payable floor', 'FAIL', 'Floor check did not trigger: ' || coalesce(v_err_msg, 'no error'));
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 10: vat_enabled = false -> new enrollment forced none
  -- ---------------------------------------------------------------------------
  select vat_enabled into v_comp_orig_vat from public.company_settings limit 1;
  update public.company_settings set vat_enabled = false;

  v_student_res := public.create_student_with_enrollment(
    p_full_name := 'VAT Proof Student 10',
    p_mobile := '+971500000010',
    p_university_id := v_uni_id,
    p_course_id := v_course_id,
    p_total_fee := 10000.00,
    p_discount := 0.00,
    p_admission_staff_id := v_staff_id,
    p_vat_treatment := 'exclusive' -- Client sends exclusive, but company is not VAT-enabled
  );
  v_enr_id := (v_student_res->>'enrollment_id')::uuid;

  select * into v_ledger from public.enrollment_ledger where enrollment_id = v_enr_id;
  update public.company_settings set vat_enabled = v_comp_orig_vat; -- restore

  if v_ledger.vat_treatment = 'none' and v_ledger.vat_total = 0.00 and v_ledger.total_payable = 10000.00 then
    insert into vat_proof_results values (10, 'vat_enabled=false -> new enrollment forced none', 'PASS',
      'treatment=' || v_ledger.vat_treatment || ', vat_total=' || v_ledger.vat_total);
  else
    insert into vat_proof_results values (10, 'vat_enabled=false -> new enrollment forced none', 'FAIL',
      'Got treatment=' || v_ledger.vat_treatment);
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 11: Void excludes VAT from totals
  -- ---------------------------------------------------------------------------
  -- In student 5: we had v_p1 (3000), v_p2 (3000), v_p3 (4500)
  perform public.void_payment(v_p3.id, 'Voiding final payment for test');
  select coalesce(sum(vat_amount), 0.00) into v_vat_sum
  from public.payments
  where enrollment_id = v_p3.enrollment_id and status = 'valid';

  if v_vat_sum = 285.72 then
    insert into vat_proof_results values (11, 'Void excludes VAT from totals', 'PASS',
      'Valid VAT sum after voiding p3=' || v_vat_sum);
  else
    insert into vat_proof_results values (11, 'Void excludes VAT from totals', 'FAIL',
      'Expected 285.72, got: ' || v_vat_sum);
  end if;
end $$;

select test_no, test_name, status, details from vat_proof_results order by test_no;

rollback;
