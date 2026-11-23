-- ============================================================================
-- Test Suite: sensitive_details_proof.sql
-- Description:
-- 1. Team admin editing an out-of-scope staff -> rejected
-- 2. Admin editing a super_admin -> rejected
-- 3. Admin editing another admin -> rejected
-- 4. Team admin editing in-scope staff -> accepted
-- 5. Super admin editing any staff -> accepted
-- ============================================================================

drop table if exists sensitive_details_proof_results;
create temp table sensitive_details_proof_results (
  proof_id int,
  proof_name text,
  status text,
  detail text
);
grant all on sensitive_details_proof_results to authenticated;

do $$
declare
  v_sa_id uuid := gen_random_uuid();
  v_team_admin_id uuid := gen_random_uuid();
  v_other_admin_id uuid := gen_random_uuid();
  v_in_scope_staff_id uuid := gen_random_uuid();
  v_out_of_scope_staff_id uuid := gen_random_uuid();
  v_res jsonb;
begin
  -- 1. Create temporary test users in auth.users
  insert into auth.users (id, email)
  values
    (v_sa_id, 'test_sd_sa@test.edubridge.local'),
    (v_team_admin_id, 'test_sd_admin@test.edubridge.local'),
    (v_other_admin_id, 'test_sd_other_admin@test.edubridge.local'),
    (v_in_scope_staff_id, 'test_sd_in_staff@test.edubridge.local'),
    (v_out_of_scope_staff_id, 'test_sd_out_staff@test.edubridge.local')
  on conflict (id) do nothing;

  -- 2. Set up profiles
  update public.profiles set full_name = 'SD Super Admin', role = 'super_admin', is_active = true, admin_scope = 'company'
  where id = v_sa_id;

  update public.profiles set full_name = 'SD Team Admin', role = 'admin', is_active = true, admin_scope = 'team'
  where id = v_team_admin_id;

  update public.profiles set full_name = 'SD Other Admin', role = 'admin', is_active = true, admin_scope = 'team'
  where id = v_other_admin_id;

  update public.profiles set full_name = 'SD In Scope Staff', role = 'staff', is_active = true, reports_to = v_team_admin_id
  where id = v_in_scope_staff_id;

  update public.profiles set full_name = 'SD Out Scope Staff', role = 'staff', is_active = true, reports_to = v_other_admin_id
  where id = v_out_of_scope_staff_id;

  -- ---------------------------------------------------------------------------
  -- Act as Team Admin
  -- ---------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', jsonb_build_object('sub', v_team_admin_id::text, 'role', 'authenticated')::text);

  -- PROOF 1: Team admin editing an out-of-scope staff -> REJECTED
  v_res := public.update_staff_sensitive_details(
    v_out_of_scope_staff_id,
    'hacked_out_scope@test.edubridge.local',
    '1995-05-15'::date,
    'Dubai UAE',
    'Emergency Person',
    '+971501112233'
  );

  if (v_res->>'success')::boolean = false then
    insert into sensitive_details_proof_results values (1, 'team admin editing an out-of-scope staff', 'PASS', 'rejected with: ' || (v_res->>'error'));
  else
    insert into sensitive_details_proof_results values (1, 'team admin editing an out-of-scope staff', 'FAIL', 'unexpectedly allowed');
  end if;

  -- PROOF 2: Admin editing a super_admin -> REJECTED
  v_res := public.update_staff_sensitive_details(
    v_sa_id,
    'hacked_sa@test.edubridge.local',
    '1990-01-01'::date,
    'Dubai UAE',
    'Emergency Person',
    '+971501112233'
  );

  if (v_res->>'success')::boolean = false then
    insert into sensitive_details_proof_results values (2, 'admin editing a super_admin', 'PASS', 'rejected with: ' || (v_res->>'error'));
  else
    insert into sensitive_details_proof_results values (2, 'admin editing a super_admin', 'FAIL', 'unexpectedly allowed');
  end if;

  -- PROOF 3: Admin editing another admin -> REJECTED
  v_res := public.update_staff_sensitive_details(
    v_other_admin_id,
    'hacked_admin@test.edubridge.local',
    '1992-02-02'::date,
    'Dubai UAE',
    'Emergency Person',
    '+971501112233'
  );

  if (v_res->>'success')::boolean = false then
    insert into sensitive_details_proof_results values (3, 'admin editing another admin', 'PASS', 'rejected with: ' || (v_res->>'error'));
  else
    insert into sensitive_details_proof_results values (3, 'admin editing another admin', 'FAIL', 'unexpectedly allowed');
  end if;

  -- PROOF 4: Team admin editing in-scope staff -> ACCEPTED
  v_res := public.update_staff_sensitive_details(
    v_in_scope_staff_id,
    'in_scope_staff@test.edubridge.local',
    '1998-08-20'::date,
    'Dubai UAE',
    'Emergency Contact',
    '+971509998877'
  );

  if (v_res->>'success')::boolean = true then
    insert into sensitive_details_proof_results values (4, 'team admin editing in-scope staff', 'PASS', 'allowed successfully');
  else
    insert into sensitive_details_proof_results values (4, 'team admin editing in-scope staff', 'FAIL', 'rejected: ' || coalesce(v_res->>'error', ''));
  end if;

  -- ---------------------------------------------------------------------------
  -- Act as Super Admin
  -- ---------------------------------------------------------------------------
  execute format('set local "request.jwt.claims" = %L', jsonb_build_object('sub', v_sa_id::text, 'role', 'authenticated')::text);

  -- PROOF 5: Super admin editing any staff -> ACCEPTED
  v_res := public.update_staff_sensitive_details(
    v_out_of_scope_staff_id,
    'sa_updated_staff@test.edubridge.local',
    '1996-06-16'::date,
    'Dubai UAE',
    'SA Contact',
    '+971505556677'
  );

  if (v_res->>'success')::boolean = true then
    insert into sensitive_details_proof_results values (5, 'super admin editing any staff', 'PASS', 'allowed successfully');
  else
    insert into sensitive_details_proof_results values (5, 'super admin editing any staff', 'FAIL', 'rejected: ' || coalesce(v_res->>'error', ''));
  end if;

  -- Clean up test records
  reset role;
  delete from public.staff_sensitive_details where user_id in (v_sa_id, v_team_admin_id, v_other_admin_id, v_in_scope_staff_id, v_out_of_scope_staff_id);
  delete from public.profiles where id in (v_sa_id, v_team_admin_id, v_other_admin_id, v_in_scope_staff_id, v_out_of_scope_staff_id);
  delete from auth.users where id in (v_sa_id, v_team_admin_id, v_other_admin_id, v_in_scope_staff_id, v_out_of_scope_staff_id);
end $$;

select proof_id, proof_name, status, detail from sensitive_details_proof_results order by proof_id;
