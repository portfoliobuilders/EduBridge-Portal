-- ============================================================================
-- Test Suite: profile_guard_proofs.sql
-- Verification for Profile Privilege Escalation Guard & Notification Safety
-- Requirements B.3 and C.3
--
-- Single transaction with complete rollback.
-- ============================================================================

begin;

create temp table profile_guard_results (
  step int,
  test_name text,
  status text,
  details text
) on commit drop;

grant all on profile_guard_results to authenticated, anon;

do $$
declare
  v_admin_id uuid := 'a1111111-1111-4111-8111-111111111111'::uuid;
  v_staff_team_id uuid := 'b2222222-2222-4222-8222-222222222222'::uuid;
  v_staff_outside_id uuid := 'c3333333-3333-4333-8333-333333333333'::uuid;
  v_notif_id uuid;
  v_visible_count int;
  v_rowcount int;
  v_caught boolean;
begin
  -- 0. Seed test users
  insert into auth.users (id, email)
  values
    (v_admin_id, 'test_admin_pg@test.edubridge.local'),
    (v_staff_team_id, 'test_staff_team_pg@test.edubridge.local'),
    (v_staff_outside_id, 'test_staff_outside_pg@test.edubridge.local')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active, admin_scope, reports_to, work_email)
  values
    (v_admin_id, 'Admin Scope User', 'admin', true, 'team', null, 'test_admin_pg@test.edubridge.local'),
    (v_staff_team_id, 'Staff Team User', 'staff', true, 'team', v_admin_id, 'test_staff_team_pg@test.edubridge.local'),
    (v_staff_outside_id, 'Staff Outside User', 'staff', true, 'team', null, 'test_staff_outside_pg@test.edubridge.local')
  on conflict (id) do update set
    role = excluded.role,
    admin_scope = excluded.admin_scope,
    reports_to = excluded.reports_to,
    is_active = excluded.is_active;

  -- -------------------------------------------------------------------------
  -- 1. STAFF TESTS (Updating own profile)
  -- -------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_team_id, 'role', 'authenticated')::text);

  -- 1a. updating role must FAIL
  v_caught := false;
  begin
    update public.profiles set role = 'super_admin' where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (1, 'Staff update own role rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff self-promotion to super_admin blocked');

  -- 1b. updating reports_to must FAIL
  v_caught := false;
  begin
    update public.profiles set reports_to = null where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (2, 'Staff update own reports_to rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff editing reports_to blocked');

  -- 1c. updating is_active must FAIL
  v_caught := false;
  begin
    update public.profiles set is_active = false where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (3, 'Staff update own is_active rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff changing is_active blocked');

  -- 1d. updating admin_scope must FAIL
  v_caught := false;
  begin
    update public.profiles set admin_scope = 'company' where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (4, 'Staff update own admin_scope rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff self-escalating admin_scope blocked');

  -- 1e. updating is_support must FAIL
  v_caught := false;
  begin
    update public.profiles set is_support = true where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (5, 'Staff update own is_support rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff toggling is_support blocked');

  -- 1f. updating support_access_enabled on company_settings must FAIL
  v_caught := false;
  begin
    update public.company_settings set support_access_enabled = true;
    get diagnostics v_rowcount = row_count;
    if v_rowcount > 0 then
      v_caught := false;
    else
      v_caught := true;
    end if;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (6, 'Staff update support_access_enabled rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff editing company_settings blocked by RLS');

  -- 1g. updating job_title must FAIL
  v_caught := false;
  begin
    update public.profiles set job_title = 'Managing Director' where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (7, 'Staff update own job_title rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff changing job title blocked');

  -- 1h. updating employee_id must FAIL
  v_caught := false;
  begin
    update public.profiles set employee_id = 'EMP-HACK' where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (8, 'Staff update own employee_id rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff editing employee_id blocked');

  -- 1i. updating joining_date must FAIL
  v_caught := false;
  begin
    update public.profiles set joining_date = '2020-01-01' where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (9, 'Staff update own joining_date rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Staff altering joining date blocked');

  -- 1j. updating own allowed fields (phone, display_name, avatar_url) must SUCCEED
  v_caught := false;
  begin
    update public.profiles
    set phone = '+971501234567',
        display_name = 'Staff Nickname',
        avatar_url = 'https://example.com/avatar.png'
    where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (10, 'Staff update allowed personal fields succeeds', case when not v_caught then 'PASS' else 'FAIL' end, 'Staff phone/display_name/avatar update permitted');

  -- -------------------------------------------------------------------------
  -- 2. ADMIN TESTS
  -- -------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text);

  -- 2a. editing a user outside visible_user_ids() must FAIL
  v_caught := false;
  begin
    update public.profiles set phone = '+971509999999' where id = v_staff_outside_id;
    get diagnostics v_rowcount = row_count;
    if v_rowcount > 0 then
      v_caught := false;
    else
      v_caught := true;
    end if;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (11, 'Admin edit user outside scope rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Admin blocked from editing staff outside visible_user_ids()');

  -- 2b. setting anyone role to super_admin must FAIL
  v_caught := false;
  begin
    update public.profiles set role = 'super_admin' where id = v_staff_team_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (12, 'Admin promote to super_admin rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Admin cannot assign super_admin role');

  -- -------------------------------------------------------------------------
  -- 3. NOTIFICATION SAFETY TESTS
  -- -------------------------------------------------------------------------
  -- Switch to service_role to seed test notifications
  set local role postgres;

  insert into public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  values (v_staff_team_id, 'payment_received', 'Initial Title', 'Initial Body', '/receipts/123', 'payment', null)
  returning id into v_notif_id;

  -- 3a. User updating read_at on own row SUCCEEDS
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff_team_id, 'role', 'authenticated')::text);

  v_caught := false;
  begin
    update public.notifications set read_at = now() where id = v_notif_id;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (13, 'User update own notification read_at succeeds', case when not v_caught then 'PASS' else 'FAIL' end, 'Setting read_at allowed');

  -- 3b. User updating title fails
  v_caught := false;
  begin
    update public.notifications set title = 'Hacked Title' where id = v_notif_id;
    get diagnostics v_rowcount = row_count;
    if v_rowcount > 0 then
      v_caught := false;
    else
      v_caught := true;
    end if;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (14, 'User update notification title rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Modifying notification title blocked by trigger');

  -- 3c. User updating body fails
  v_caught := false;
  begin
    update public.notifications set body = 'Hacked Body' where id = v_notif_id;
    get diagnostics v_rowcount = row_count;
    if v_rowcount > 0 then
      v_caught := false;
    else
      v_caught := true;
    end if;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (15, 'User update notification body rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Modifying notification body blocked by trigger');

  -- 3d. User updating link fails
  v_caught := false;
  begin
    update public.notifications set link = '/hacked' where id = v_notif_id;
    get diagnostics v_rowcount = row_count;
    if v_rowcount > 0 then
      v_caught := false;
    else
      v_caught := true;
    end if;
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (16, 'User update notification link rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Modifying notification link blocked by trigger');

  -- 3e. Link https://x.com rejected by CHECK constraint
  set local role postgres;
  v_caught := false;
  begin
    insert into public.notifications (user_id, type, title, body, link)
    values (v_staff_team_id, 'general', 'External Link', 'Body', 'https://x.com');
  exception when check_violation then
    v_caught := true;
  end;
  insert into profile_guard_results values (17, 'Notification link https://x.com rejected', case when v_caught then 'PASS' else 'FAIL' end, 'External scheme blocked by constraint');

  -- 3f. Link //x.com rejected by CHECK constraint
  v_caught := false;
  begin
    insert into public.notifications (user_id, type, title, body, link)
    values (v_staff_team_id, 'general', 'Protocol-relative Link', 'Body', '//x.com');
  exception when check_violation then
    v_caught := true;
  end;
  insert into profile_guard_results values (18, 'Notification link //x.com rejected', case when v_caught then 'PASS' else 'FAIL' end, 'Protocol-relative path blocked by constraint');

  -- 3g. Valid internal link /candidates succeeds
  v_caught := false;
  begin
    insert into public.notifications (user_id, type, title, body, link)
    values (v_staff_team_id, 'general', 'Internal Link', 'Body', '/candidates');
  exception when others then
    v_caught := true;
  end;
  insert into profile_guard_results values (19, 'Notification link /candidates succeeds', case when not v_caught then 'PASS' else 'FAIL' end, 'Internal relative path permitted');

end $$;

select step, test_name, status, details from profile_guard_results order by step;

rollback;
