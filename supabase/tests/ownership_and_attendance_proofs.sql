-- ============================================================================
-- Test Suite: ownership_and_attendance_proofs.sql
-- Verification for Candidate Ownership, Transfer, Document Actions & Attendance Security
-- Requirements 2 & 3
--
-- Single transaction with complete rollback.
-- ============================================================================

begin;

create temp table ownership_att_results (
  step int,
  test_name text,
  status text,
  details text
) on commit drop;

grant all on ownership_att_results to authenticated, anon;

do $$
declare
  v_admin_a_id uuid := '10101010-1010-4010-8010-101010101010'::uuid;
  v_admin_other_id uuid := '11111111-1010-4010-8010-111111111111'::uuid;
  v_staff_a_id uuid := '20202020-2020-4020-8020-202020202020'::uuid;
  v_staff_b_id uuid := '30303030-3030-4030-8030-303030303030'::uuid;
  v_uni_id uuid;
  v_course_id uuid;
  v_doc_type_id uuid;
  v_student_b_id uuid;
  v_student_b_code text;
  v_enrollment_b_id uuid;
  v_payment_b_id uuid;
  v_doc_b_id uuid;
  v_link_b_id uuid;
  v_office_id uuid;
  v_punch_a_id uuid;
  v_lookup jsonb;
  v_count int;
  v_caught boolean;
  v_lat numeric;
begin
  -- 0. Seed test staff & admins
  insert into auth.users (id, email)
  values
    (v_admin_a_id, 'test_adm_a@test.edubridge.local'),
    (v_admin_other_id, 'test_adm_other@test.edubridge.local'),
    (v_staff_a_id, 'test_staff_a@test.edubridge.local'),
    (v_staff_b_id, 'test_staff_b@test.edubridge.local')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active, admin_scope, reports_to, work_email)
  values
    (v_admin_a_id, 'Admin A', 'admin', true, 'team', null, 'test_adm_a@test.edubridge.local'),
    (v_admin_other_id, 'Admin Other Team', 'admin', true, 'team', null, 'test_adm_other@test.edubridge.local'),
    (v_staff_a_id, 'Staff A', 'staff', true, 'team', v_admin_a_id, 'test_staff_a@test.edubridge.local'),
    (v_staff_b_id, 'Staff B', 'staff', true, 'team', v_admin_a_id, 'test_staff_b@test.edubridge.local')
  on conflict (id) do update set
    role = excluded.role,
    reports_to = excluded.reports_to,
    is_active = true;

  -- Seed university, course & document type
  select id into v_uni_id from public.universities where is_active = true limit 1;
  select id into v_course_id from public.courses where university_id = v_uni_id and is_active = true limit 1;
  select id into v_doc_type_id from public.document_types where is_active = true limit 1;

  -- Create candidate owned by Staff B
  insert into public.students (full_name, mobile, whatsapp, created_by, owner_id)
  values ('Candidate B Owned', '+971501112233', '+971501112233', v_staff_b_id, v_staff_b_id)
  returning id, student_code into v_student_b_id, v_student_b_code;

  insert into public.enrollments (student_id, university_id, course_id, total_fee, discount, admission_staff_id, created_by, status)
  values (v_student_b_id, v_uni_id, v_course_id, 10000, 0, v_staff_b_id, v_staff_b_id, 'active')
  returning id into v_enrollment_b_id;

  insert into public.payments (enrollment_id, student_id, receipt_no, amount, mode, purpose, fee_snapshot, paid_before_snapshot, balance_after_snapshot, paid_at, received_by)
  values (v_enrollment_b_id, v_student_b_id, 'EB-RV-2026-98765', 2000, 'card', 'admission', 10000, 0, 8000, now(), v_staff_b_id)
  returning id into v_payment_b_id;

  -- Create document for candidate B
  insert into public.candidate_documents (student_id, document_type_id, title, file_path, file_name, size_bytes, mime_type, uploaded_via, uploaded_by, status)
  values (v_student_b_id, v_doc_type_id, 'Doc B', 'test/doc_b.pdf', 'doc_b.pdf', 1024, 'application/pdf', 'staff', v_staff_b_id, 'received')
  returning id into v_doc_b_id;

  -- Create upload link for candidate B
  insert into public.document_upload_links (student_id, token, requested_types, expires_at, created_by)
  values (v_student_b_id, 'token_candidate_b_1234567890abcdef1234567890abcdef', array[v_doc_type_id], now() + interval '7 days', v_staff_b_id)
  returning id into v_link_b_id;

  -- Seed Office for attendance
  insert into public.offices (name, address, latitude, longitude, radius_m, require_network_match, is_active)
  values ('Dubai Test Office', 'Royal House', 25.276987, 55.337042, 100, false, true)
  returning id into v_office_id;

  insert into public.staff_attendance_settings (user_id, office_id, shift_start, shift_end, attendance_required, allow_field_punch)
  values (v_staff_a_id, v_office_id, '09:00', '18:00', true, false)
  on conflict (user_id) do update set office_id = v_office_id, allow_field_punch = false;

  -- -------------------------------------------------------------------------
  -- 1. CANDIDATE OWNERSHIP ISOLATION
  -- -------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);

  -- 1a. Staff A cannot select Staff B's candidate
  select count(*) into v_count from public.students where id = v_student_b_id;
  insert into ownership_att_results values (1, 'Staff A select Staff B candidate rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A cannot view Staff B candidate in students table');

  -- 1b. Staff A cannot update Staff B's candidate
  update public.students set full_name = 'Hacked Name' where id = v_student_b_id;
  get diagnostics v_count = row_count;
  insert into ownership_att_results values (2, 'Staff A update Staff B candidate rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A update on Staff B candidate affected 0 rows');

  -- 1c. Staff A cannot select Staff B's enrollment
  select count(*) into v_count from public.enrollments where id = v_enrollment_b_id;
  insert into ownership_att_results values (3, 'Staff A select Staff B enrollment rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A cannot select Staff B enrollment');

  -- 1d. Staff A cannot select Staff B's payment
  select count(*) into v_count from public.payments where id = v_payment_b_id;
  insert into ownership_att_results values (4, 'Staff A select Staff B payment rejected', case when v_count = 0 then 'PASS' else 'FAIL' end, 'Staff A cannot view Staff B payment rows');

  -- -------------------------------------------------------------------------
  -- 2. COUNTER LOOKUP RPC TESTS
  -- -------------------------------------------------------------------------
  -- 2a. Exact full mobile returns candidate
  select public.lookup_candidate_for_payment('+971501112233') into v_lookup;
  insert into ownership_att_results values (5, 'Counter lookup exact mobile succeeds', case when (v_lookup->>'student_id') = v_student_b_id::text then 'PASS' else 'FAIL' end, 'Found candidate via full international mobile');

  -- 2b. Exact student_code returns candidate
  select public.lookup_candidate_for_payment(v_student_b_code) into v_lookup;
  insert into ownership_att_results values (6, 'Counter lookup exact student_code succeeds', case when (v_lookup->>'student_id') = v_student_b_id::text then 'PASS' else 'FAIL' end, 'Found candidate via exact code');

  -- 2c. Partial mobile returns 0 rows (NULL)
  select public.lookup_candidate_for_payment('112233') into v_lookup;
  insert into ownership_att_results values (7, 'Counter lookup partial mobile rejected', case when v_lookup is null then 'PASS' else 'FAIL' end, 'Partial mobile query returns NULL');

  -- 2d. Partial student code returns 0 rows (NULL)
  select public.lookup_candidate_for_payment(substring(v_student_b_code from 1 for 6)) into v_lookup;
  insert into ownership_att_results values (8, 'Counter lookup partial code rejected', case when v_lookup is null then 'PASS' else 'FAIL' end, 'Prefix query returns NULL');

  -- 2e. Counter lookup returns masked mobile and minimal fields
  select public.lookup_candidate_for_payment(v_student_b_code) into v_lookup;
  insert into ownership_att_results values (9, 'Counter lookup returns minimal masked payload', case when (v_lookup ? 'student_id') and (v_lookup ? 'masked_mobile') and not (v_lookup ? 'whatsapp') then 'PASS' else 'FAIL' end, 'Counter receives only safe payload without personal data');

  -- -------------------------------------------------------------------------
  -- 3. DOCUMENT ACTIONS SCOPE & PERMISSIONS (Section 2)
  -- -------------------------------------------------------------------------
  -- 3a. Team admin from ANOTHER team cannot act on candidate B
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin_other_id, 'role', 'authenticated')::text);

  v_caught := false;
  begin
    perform public.verify_candidate_document(v_doc_b_id, 'verified', 'Other admin verify');
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (10, 'Other team admin verify document rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Admin outside scope cannot verify candidate document');

  v_caught := false;
  begin
    perform public.archive_candidate_document(v_doc_b_id);
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (11, 'Other team admin archive document rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Admin outside scope cannot archive candidate document');

  v_caught := false;
  begin
    perform public.revoke_document_upload_link(v_link_b_id);
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (12, 'Other team admin revoke link rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Admin outside scope cannot revoke upload link');

  -- 3b. Before transfer: Staff B (owner) CAN verify; Staff A CANNOT
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);
  v_caught := false;
  begin
    perform public.verify_candidate_document(v_doc_b_id, 'verified', 'Staff A verify');
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (13, 'Staff A verify Candidate B document rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff non-owner blocked from verifying document');

  -- 3c. Candidate transfer to Staff A (both candidate ownership and enrollment admission staff)
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin_a_id, 'role', 'authenticated')::text);
  perform public.transfer_candidate(v_student_b_id, v_staff_a_id, 'candidate', 'Ownership transfer to Staff A');
  perform public.transfer_candidate(v_student_b_id, v_staff_a_id, 'enrollment', 'Enrollment transfer to Staff A', v_enrollment_b_id);

  -- 3d. After transfer: New owner (Staff A) CAN verify; Old owner (Staff B) CANNOT
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);
  v_caught := false;
  begin
    perform public.verify_candidate_document(v_doc_b_id, 'verified', 'Staff A now owner verified');
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (14, 'New owner (Staff A) verify document succeeds', case when not v_caught then 'PASS' else 'FAIL' end, 'Transferred owner successfully verified document');

  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b_id, 'role', 'authenticated')::text);
  v_caught := false;
  begin
    perform public.verify_candidate_document(v_doc_b_id, 'rejected', 'Staff B old owner try verify');
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (15, 'Old owner (Staff B) verify document rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Former owner strictly forbidden after transfer');

  -- -------------------------------------------------------------------------
  -- 4. ATTENDANCE SECURITY & PRIVACY PROOFS (Section 3)
  -- -------------------------------------------------------------------------
  set local role postgres;
  insert into public.attendance_punches (user_id, office_id, kind, at, lat, lng, status)
  values (v_staff_a_id, v_office_id, 'in', now(), 25.276987, 55.337042, 'accepted')
  returning id into v_punch_a_id;

  -- 4a. Staff B cannot read Staff A's punch lat/lng (returns 0 rows via RLS)
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_b_id, 'role', 'authenticated')::text);

  select lat into v_lat from public.attendance_punches where id = v_punch_a_id;
  insert into ownership_att_results values (16, 'Staff cannot read another staff punch coordinates', case when v_lat is null then 'PASS' else 'FAIL' end, 'RLS returns 0 rows when staff queries peer punch');

  -- 4b. Admin A (same team) CAN read Staff A's punch lat/lng
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin_a_id, 'role', 'authenticated')::text);
  select lat into v_lat from public.attendance_punches where id = v_punch_a_id;
  insert into ownership_att_results values (17, 'Team admin can read team staff punch coordinates', case when v_lat = 25.276987 then 'PASS' else 'FAIL' end, 'Admin in scope permitted to read attendance coordinates');

  -- 4c. Admin from other team CANNOT read Staff A's punch
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin_other_id, 'role', 'authenticated')::text);
  select lat into v_lat from public.attendance_punches where id = v_punch_a_id;
  insert into ownership_att_results values (18, 'Other team admin cannot read punch coordinates', case when v_lat is null then 'PASS' else 'FAIL' end, 'Admin outside scope sees 0 rows for peer team punches');

  -- 4d. Normal delete on attendance_punches is BLOCKED by immutability trigger
  set local role postgres;
  v_caught := false;
  begin
    delete from public.attendance_punches where id = v_punch_a_id;
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (19, 'Direct delete on attendance_punches rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Trigger blocks deletion by default');

  -- 4e. Guarded test cleanup session flag permits delete by postgres/service_role
  v_caught := false;
  begin
    set local app.allow_test_data_cleanup = 'true';
    delete from public.attendance_punches where id = v_punch_a_id;
  exception when others then
    v_caught := true;
  end;
  insert into ownership_att_results values (20, 'Guarded cleanup flag allows punch deletion by postgres', case when not v_caught then 'PASS' else 'FAIL' end, 'Session flag app.allow_test_data_cleanup enables test purging');

end $$;

select step, test_name, status, details from ownership_att_results order by step;

rollback;
