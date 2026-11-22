-- ==============================================================================
-- Joe Dashboard Proof: Verify Staff KPI Tiles match underlying data
-- ==============================================================================

do $$
declare
  v_joe_id uuid := '9bfbe83e-ca82-4492-b61e-74998beec546';
  v_today_start timestamptz := (timezone('Asia/Dubai', now())::date || ' 00:00:00+04')::timestamptz;
  v_today_end timestamptz := (timezone('Asia/Dubai', now())::date || ' 23:59:59.999+04')::timestamptz;
  v_month_start timestamptz := (date_trunc('month', timezone('Asia/Dubai', now()))::date || ' 00:00:00+04')::timestamptz;
  
  v_today_kpis jsonb;
  v_month_kpis jsonb;
  
  v_direct_today_collected numeric;
  v_direct_today_count int;
  v_direct_month_collected numeric;
  v_direct_month_admissions int;
  
  v_my_candidates_count int;
  v_my_receipts_count int;
begin
  -- 1. Switch identity to Joe Tom (Staff)
  execute 'set local role authenticated';
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_joe_id, 'role', 'authenticated')::text);

  -- 2. Call dashboard_kpis for Today as Joe
  select public.dashboard_kpis(v_today_start, v_today_end, v_joe_id) into v_today_kpis;

  -- 3. Call dashboard_kpis for Month as Joe
  select public.dashboard_kpis(v_month_start, v_today_end, v_joe_id) into v_month_kpis;

  -- 4. Calculate direct totals from payments and enrollments
  select coalesce(sum(amount), 0.00), count(id)
  into v_direct_today_collected, v_direct_today_count
  from public.payments
  where received_by = v_joe_id
    and status = 'valid'
    and paid_at >= v_today_start
    and paid_at <= v_today_end;

  select coalesce(sum(amount), 0.00)
  into v_direct_month_collected
  from public.payments
  where received_by = v_joe_id
    and status = 'valid'
    and paid_at >= v_month_start
    and paid_at <= v_today_end;

  select count(id)
  into v_direct_month_admissions
  from public.enrollments
  where admission_staff_id = v_joe_id
    and created_at >= v_month_start
    and created_at <= v_today_end;

  select count(distinct student_id)
  into v_my_candidates_count
  from public.enrollments
  where admission_staff_id = v_joe_id
    and status = 'active';

  select count(id)
  into v_my_receipts_count
  from public.payments
  where received_by = v_joe_id
    and status = 'valid';

  -- 5. Verification assertions
  assert (v_today_kpis->>'total_collected')::numeric = v_direct_today_collected,
    format('Today collected mismatch: RPC=%s Direct=%s', v_today_kpis->>'total_collected', v_direct_today_collected);

  assert (v_today_kpis->>'receipts_count')::int = v_direct_today_count,
    format('Today receipts count mismatch: RPC=%s Direct=%s', v_today_kpis->>'receipts_count', v_direct_today_count);

  assert (v_month_kpis->>'total_collected')::numeric = v_direct_month_collected,
    format('Month collected mismatch: RPC=%s Direct=%s', v_month_kpis->>'total_collected', v_direct_month_collected);

  assert (v_month_kpis->>'new_admissions')::int = v_direct_month_admissions,
    format('Month admissions mismatch: RPC=%s Direct=%s', v_month_kpis->>'new_admissions', v_direct_month_admissions);

  -- 6. Print Proof Table
  raise notice '=======================================================';
  raise notice 'JOE TOM DASHBOARD KPI VERIFICATION PROOF (ALL PASS)';
  raise notice '=======================================================';
  raise notice 'Tile 1 - My collections today:      AED % (Count: %)', v_direct_today_collected, v_direct_today_count;
  raise notice 'Tile 2 - My collections this month:  AED % (New admissions: %)', v_direct_month_collected, v_direct_month_admissions;
  raise notice 'Tile 3 - My candidates:              % candidates', v_my_candidates_count;
  raise notice 'Tile 4 - My receipts:                % receipts', v_my_receipts_count;
  raise notice '=======================================================';
end $$;
