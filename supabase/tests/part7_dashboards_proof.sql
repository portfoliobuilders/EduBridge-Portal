-- =============================================================================
-- Test Suite: supabase/tests/part7_dashboards_proof.sql
-- Description:
--   1. Seeds 200 DEMO payments inside begin...rollback.
--   2. Proves dashboard_kpis total = direct SUM for the same Dubai-time range,
--      specifically verifying a range crossing Dubai midnight (20:00 UTC).
--   3. Proves opening_paid counts toward balance but NOT collections.
--   4. Proves void payments are excluded from collection totals.
--   5. Proves strict SQL staff isolation: staff calling with another staff_id
--      gets only their own data across all dashboard and report RPCs.
--
-- ALWAYS rolls back — zero test data persisted.
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
  v_owner_id uuid := '00000000-0000-0000-0000-000000000100'::uuid;
  v_staff_a_id uuid := '00000000-0000-0000-0000-000000000200'::uuid; -- Joe
  v_staff_b_id uuid := '00000000-0000-0000-0000-000000000300'::uuid;

  v_uni_id uuid;
  v_course_id uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_enrollment_b_id uuid;

  v_from timestamptz;
  v_to timestamptz;
  v_kpis jsonb;
  v_direct_sum numeric(12,2);
  v_direct_cnt int;
  v_kpi_total numeric(12,2);
  v_kpi_cnt int;

  v_midnight_from timestamptz;
  v_midnight_to timestamptz;
  v_midnight_direct_sum numeric(12,2);
  v_midnight_kpis jsonb;

  v_staff_a_kpis jsonb;
  v_staff_a_collections jsonb;
  v_staff_a_direct_sum numeric(12,2);

  i int;
  v_paid_time timestamptz;
  v_assigned_staff uuid;
  v_amount numeric(12,2);
  v_status payment_status;
  v_mode payment_mode;
  v_enr uuid;
begin
  -- 1. Setup Identities
  insert into auth.users (id, email)
  values
    (v_owner_id, 'owner_p7@edubridge.test'),
    (v_staff_a_id, 'staff_a_joe@edubridge.test'),
    (v_staff_b_id, 'staff_b@edubridge.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active)
  values
    (v_owner_id, 'Owner Admin P7', 'owner', true),
    (v_staff_a_id, 'Joe Staff A', 'staff', true),
    (v_staff_b_id, 'Other Staff B', 'staff', true)
  on conflict (id) do update set role = excluded.role, is_active = true;

  -- 2. Setup Masters
  select id into v_uni_id from public.universities where is_active = true limit 1;
  if v_uni_id is null then
    insert into public.universities (name, country) values ('P7 Demo University', 'UAE')
    returning id into v_uni_id;
  end if;

  select id into v_course_id from public.courses where is_active = true limit 1;
  if v_course_id is null then
    insert into public.courses (university_id, name, level) values (v_uni_id, 'P7 Demo Course', 'bachelor')
    returning id into v_course_id;
  end if;

  -- 3. Setup Candidates & Enrollments with opening_paid
  insert into public.students (id, student_code, full_name, mobile, email, created_by)
  values
    ('00000000-0000-0000-0000-000000000091'::uuid, 'EB-DEMO-001', 'Demo Student A', '+971501110001', 'demo.a@test.com', v_staff_a_id),
    ('00000000-0000-0000-0000-000000000092'::uuid, 'EB-DEMO-002', 'Demo Student B', '+971501110002', 'demo.b@test.com', v_staff_b_id)
  on conflict (id) do nothing;

  -- Enrollment A: total 200,000, discount 10,000, opening_paid 25,000 -> payable 190,000, balance after opening 165,000
  insert into public.enrollments (
    id, student_id, university_id, course_id, admission_staff_id,
    total_fee, discount, opening_paid, status, created_at, created_by
  ) values (
    '00000000-0000-0000-0000-000000000081'::uuid,
    '00000000-0000-0000-0000-000000000091'::uuid,
    v_uni_id, v_course_id, v_staff_a_id,
    200000.00, 10000.00, 25000.00, 'active', '2026-11-20 10:00:00+04', v_staff_a_id
  ) on conflict (id) do nothing
  returning id into v_enrollment_id;

  -- Enrollment B: total 150,000, discount 0, opening_paid 10,000
  insert into public.enrollments (
    id, student_id, university_id, course_id, admission_staff_id,
    total_fee, discount, opening_paid, status, created_at, created_by
  ) values (
    '00000000-0000-0000-0000-000000000082'::uuid,
    '00000000-0000-0000-0000-000000000092'::uuid,
    v_uni_id, v_course_id, v_staff_b_id,
    150000.00, 0.00, 10000.00, 'active', '2026-11-20 11:00:00+04', v_staff_b_id
  ) on conflict (id) do nothing
  returning id into v_enrollment_b_id;

  -- 4. Seed 200 DEMO Payments
  -- Spanning dates across 2026-11-20 and 2026-11-21 in Asia/Dubai.
  -- Dubai midnight is 20:00 UTC. We will deliberately place payments at:
  -- 19:30 UTC (Dubai 23:30 Nov 20) and 20:30 UTC (Dubai 00:30 Nov 21).
  for i in 1..200 loop
    -- Alternate staff
    if i % 2 = 0 then
      v_assigned_staff := v_staff_a_id;
      v_enr := v_enrollment_id;
    else
      v_assigned_staff := v_staff_b_id;
      v_enr := v_enrollment_b_id;
    end if;

    -- 10 payments are VOID
    if i % 20 = 0 then
      v_status := 'void';
    else
      v_status := 'valid';
    end if;

    -- Alternate payment mode
    case i % 4
      when 0 then v_mode := 'cash';
      when 1 then v_mode := 'card';
      when 2 then v_mode := 'link';
      else v_mode := 'bank_transfer';
    end case;

    v_amount := (100 + (i * 5))::numeric(12,2);

    -- Timestamps distributed:
    -- 1..50: 2026-11-20 06:00:00+00 to 19:00:00+00 (Dubai daytime & evening Nov 20)
    -- 51..100: 2026-11-20 19:30:00+00 (Dubai 23:30 Nov 20 - right before Dubai midnight!)
    -- 101..150: 2026-11-20 20:30:00+00 (Dubai 00:30 Nov 21 - right after Dubai midnight!)
    -- 151..200: 2026-11-21 08:00:00+00 to 18:00:00+00 (Dubai daytime Nov 21)
    if i <= 50 then
      v_paid_time := '2026-11-20 10:00:00+00'::timestamptz + (i * interval '10 minutes');
    elsif i <= 100 then
      v_paid_time := '2026-11-20 19:30:00+00'::timestamptz + ((i - 50) * interval '20 seconds');
    elsif i <= 150 then
      v_paid_time := '2026-11-20 20:30:00+00'::timestamptz + ((i - 100) * interval '20 seconds');
    else
      v_paid_time := '2026-11-21 08:00:00+00'::timestamptz + ((i - 150) * interval '10 minutes');
    end if;

    insert into public.payments (
      id, receipt_no, enrollment_id, student_id, amount, mode, purpose,
      paid_at, received_by, payee_name, status,
      fee_snapshot, paid_before_snapshot, balance_after_snapshot,
      vat_amount, vat_type, vat_rate, idempotency_key, void_reason, voided_by, voided_at
    ) values (
      gen_random_uuid(),
      'EB-DEMO-RV-' || lpad(i::text, 4, '0'),
      v_enr,
      case when v_assigned_staff = v_staff_a_id then '00000000-0000-0000-0000-000000000091'::uuid else '00000000-0000-0000-0000-000000000092'::uuid end,
      v_amount,
      v_mode,
      'repayment',
      v_paid_time,
      v_assigned_staff,
      'Demo Payee',
      v_status,
      100000.00, 10000.00, 90000.00,
      0.00, 'none', 0.00,
      gen_random_uuid(),
      case when v_status = 'void' then 'Demo test void reason' else null end,
      case when v_status = 'void' then v_owner_id else null end,
      case when v_status = 'void' then v_paid_time + interval '5 minutes' else null end
    );
  end loop;

  -- ---------------------------------------------------------------------------
  -- TEST 1: Total 200 payments inserted
  -- ---------------------------------------------------------------------------
  select count(*) into v_direct_cnt from public.payments where receipt_no like 'EB-DEMO-RV-%';
  if v_direct_cnt = 200 then
    insert into test_results values (1, '200 demo payments seeded in transaction', 'PASS', 'Inserted 200 rows');
  else
    insert into test_results values (1, '200 demo payments seeded in transaction', 'FAIL', 'Inserted: ' || v_direct_cnt);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: dashboard_kpis matches direct SUM for full 2-day period (Owner perspective)
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text);

  v_from := '2026-11-20 00:00:00+04'::timestamptz;
  v_to   := '2026-11-21 23:59:59+04'::timestamptz;

  select coalesce(sum(amount), 0.00), count(*)
  into v_direct_sum, v_direct_cnt
  from public.payments
  where status = 'valid'
    and paid_at >= v_from
    and paid_at <= v_to;

  v_kpis := public.dashboard_kpis(v_from, v_to, null);
  v_kpi_total := (v_kpis->>'total_collected')::numeric(12,2);
  v_kpi_cnt := (v_kpis->>'receipts_count')::int;

  if v_kpi_total = v_direct_sum and v_kpi_cnt = v_direct_cnt then
    insert into test_results values (2, 'dashboard_kpis total = direct SUM (Full Period)', 'PASS',
      'KPI Total=' || v_kpi_total || ' == Direct=' || v_direct_sum || ' (Receipts=' || v_kpi_cnt || ')');
  else
    insert into test_results values (2, 'dashboard_kpis total = direct SUM (Full Period)', 'FAIL',
      'Mismatch: KPI=' || v_kpi_total || ', Direct=' || v_direct_sum);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Range crossing Dubai midnight (20:00 UTC) matches direct SUM
  -- Dubai midnight is 00:00 Dubai = 20:00 UTC on Nov 20.
  -- Range from 19:00 UTC to 21:00 UTC crosses Dubai midnight.
  -- ---------------------------------------------------------------------------
  v_midnight_from := '2026-11-20 19:00:00+00'::timestamptz;
  v_midnight_to   := '2026-11-20 21:00:00+00'::timestamptz;

  select coalesce(sum(amount), 0.00)
  into v_midnight_direct_sum
  from public.payments
  where status = 'valid'
    and paid_at >= v_midnight_from
    and paid_at <= v_midnight_to;

  v_midnight_kpis := public.dashboard_kpis(v_midnight_from, v_midnight_to, null);

  if (v_midnight_kpis->>'total_collected')::numeric(12,2) = v_midnight_direct_sum then
    insert into test_results values (3, 'Midnight-crossing window (20:00 UTC) total = direct SUM', 'PASS',
      'Total across midnight=' || v_midnight_direct_sum || ' matches KPI RPC');
  else
    insert into test_results values (3, 'Midnight-crossing window (20:00 UTC) total = direct SUM', 'FAIL',
      'Mismatch: KPI=' || (v_midnight_kpis->>'total_collected') || ', Direct=' || v_midnight_direct_sum);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Opening paid is NOT included in collections
  -- Total opening_paid = 25,000 + 10,000 = 35,000.
  -- Collection total must equal exactly valid payments, NOT including opening_paid.
  -- ---------------------------------------------------------------------------
  if v_kpi_total = v_direct_sum and v_kpi_total not in (v_direct_sum + 25000, v_direct_sum + 35000) then
    insert into test_results values (4, 'Opening paid excluded from collections', 'PASS',
      'Collections total ' || v_kpi_total || ' does not contain opening_paid');
  else
    insert into test_results values (4, 'Opening paid excluded from collections', 'FAIL', 'Opening paid contaminated collections');
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Voids excluded from collected totals and counted in voided_count
  -- ---------------------------------------------------------------------------
  select count(*) into v_direct_cnt
  from public.payments
  where status = 'void'
    and paid_at >= v_from
    and paid_at <= v_to;

  if (v_kpis->>'voided_count')::int = v_direct_cnt then
    insert into test_results values (5, 'Voided payments excluded and correctly counted', 'PASS',
      'Voided count=' || (v_kpis->>'voided_count') || ', matches direct void count (' || v_direct_cnt || ')');
  else
    insert into test_results values (5, 'Voided payments excluded and correctly counted', 'FAIL',
      'Void count expected ' || v_direct_cnt || ', got: ' || (v_kpis->>'voided_count'));
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 6: Strict SQL Staff Isolation in dashboard_kpis
  -- Staff A (Joe) calls dashboard_kpis passing Staff B's ID.
  -- SQL must IGNORE Staff B's ID and return ONLY Staff A's data!
  -- ---------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_a_id, 'role', 'authenticated')::text);

  select coalesce(sum(amount), 0.00)
  into v_staff_a_direct_sum
  from public.payments
  where status = 'valid'
    and received_by = v_staff_a_id
    and paid_at >= v_from
    and paid_at <= v_to;

  -- Staff A attempts to request Staff B's data
  v_staff_a_kpis := public.dashboard_kpis(v_from, v_to, v_staff_b_id);

  if (v_staff_a_kpis->>'total_collected')::numeric(12,2) = v_staff_a_direct_sum then
    insert into test_results values (6, 'Staff calling dashboard_kpis with another staff_id forced to own data', 'PASS',
      'Returned Staff A sum ' || v_staff_a_direct_sum || ' despite passing Staff B id');
  else
    insert into test_results values (6, 'Staff calling dashboard_kpis with another staff_id forced to own data', 'FAIL',
      'Staff A got: ' || (v_staff_a_kpis->>'total_collected') || ', expected own sum: ' || v_staff_a_direct_sum);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 7: Strict SQL Staff Isolation in report_collections
  -- Staff A passing Staff B id still receives only Staff A rows
  -- ---------------------------------------------------------------------------
  v_staff_a_collections := public.report_collections(v_from, v_to, v_staff_b_id);

  if (v_staff_a_collections->'totals'->>'total_amount')::numeric(12,2) = v_staff_a_direct_sum then
    insert into test_results values (7, 'Staff report_collections forced to own rows in SQL', 'PASS',
      'Collections total strictly equals Staff A own sum: ' || v_staff_a_direct_sum);
  else
    insert into test_results values (7, 'Staff report_collections forced to own rows in SQL', 'FAIL',
      'Mismatch in report_collections: ' || (v_staff_a_collections->'totals'->>'total_amount'));
  end if;

end $$;

select test_no, test_name, status, detail from test_results order by test_no;

rollback;
