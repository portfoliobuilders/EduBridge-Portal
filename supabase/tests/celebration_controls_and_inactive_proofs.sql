-- ==============================================================================
-- Test Suite: celebration_controls_and_inactive_proofs.sql
-- Description:
--   1. Master celebrations off -> 0 celebrants from get_celebrations_today & upcoming.
--   2. Excluded staff (celebrate_birthday/anniversary = false) -> not celebrated.
--   3. Staff cannot change company_settings master switch.
--   4. Staff cannot change their own celebration exclusion flags on public.profiles.
--   5. Inactive staff (is_active = false) are excluded from celebrations, leaderboard,
--      and cannot be assigned as reports_to.
-- ==============================================================================

begin;

do $$
declare
  v_sa uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_inactive uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_cur_year int := extract(year from v_today)::int;
  v_cur_month int := extract(month from v_today)::int;
  v_cur_day int := extract(day from v_today)::int;
  v_count int;
  v_upcoming int;
  v_res jsonb;
  v_found boolean;
  v_failed boolean := false;
begin
  -- 1. Create test users in auth.users & profiles
  insert into auth.users (id, email)
  values
    (v_sa, 'cel_sa_proof@temp.local'),
    (v_staff, 'cel_staff_proof@temp.local'),
    (v_inactive, 'cel_inactive_proof@temp.local')
  on conflict (id) do nothing;

  update public.profiles set
    full_name = 'Cel SA Proof', role = 'super_admin', is_active = true, admin_scope = 'company'
  where id = v_sa;

  update public.profiles set
    full_name = 'Cel Staff Proof', role = 'staff', is_active = true,
    celebrate_birthday = true, celebrate_anniversary = true,
    joining_date = make_date(v_cur_year - 2, v_cur_month, v_cur_day)
  where id = v_staff;

  insert into public.staff_sensitive_details (user_id, dob)
  values (v_staff, make_date(v_cur_year - 25, v_cur_month, v_cur_day))
  on conflict (user_id) do update
  set dob = make_date(v_cur_year - 25, v_cur_month, v_cur_day);

  update public.profiles set
    full_name = 'Cel Inactive Proof', role = 'staff', is_active = false,
    celebrate_birthday = true, celebrate_anniversary = true,
    joining_date = make_date(v_cur_year - 3, v_cur_month, v_cur_day)
  where id = v_inactive;

  insert into public.staff_sensitive_details (user_id, dob)
  values (v_inactive, make_date(v_cur_year - 30, v_cur_month, v_cur_day))
  on conflict (user_id) do update
  set dob = make_date(v_cur_year - 30, v_cur_month, v_cur_day);

  -- ---------------------------------------------------------------------------
  -- PROOF 1: Master switch OFF -> 0 celebrants returned
  -- ---------------------------------------------------------------------------
  update public.company_settings set celebrations_enabled = false where singleton = true;

  select count(*) into v_count from public.get_celebrations_today();
  if v_count != 0 then
    raise exception 'FAIL: get_celebrations_today returned % rows when celebrations_enabled is false', v_count;
  end if;

  select count(*) into v_upcoming from public.get_upcoming_celebrations_this_week();
  if v_upcoming != 0 then
    raise exception 'FAIL: get_upcoming_celebrations_this_week returned % rows when celebrations_enabled is false', v_upcoming;
  end if;

  select public.process_daily_celebrations() into v_res;
  if v_res != '[]'::jsonb then
    raise exception 'FAIL: process_daily_celebrations returned % when celebrations_enabled is false', v_res;
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 2: Excluded staff -> not celebrated even when master switch is ON
  -- ---------------------------------------------------------------------------
  update public.company_settings set celebrations_enabled = true where singleton = true;

  -- Exclude the active staff member from celebrations
  update public.profiles
  set celebrate_birthday = false, celebrate_anniversary = false
  where id = v_staff;

  select exists (
    select 1 from public.get_celebrations_today() where user_id = v_staff
  ) into v_found;

  if v_found then
    raise exception 'FAIL: Excluded staff member appeared in get_celebrations_today()';
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 3: Inactive staff (is_active = false) -> never celebrated
  -- ---------------------------------------------------------------------------
  select exists (
    select 1 from public.get_celebrations_today() where user_id = v_inactive
  ) into v_found;

  if v_found then
    raise exception 'FAIL: Inactive staff member appeared in get_celebrations_today()';
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 4: Staff cannot change company_settings master switch (RLS enforced)
  -- ---------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff::text, 'role', 'authenticated')::text);

  update public.company_settings set celebrations_enabled = false;
  reset role;

  if (select celebrations_enabled from public.company_settings where singleton = true) = false then
    raise exception 'FAIL: Staff was able to update company_settings.celebrations_enabled!';
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 5: Staff cannot change their own celebration exclusion flags
  -- ---------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_staff::text, 'role', 'authenticated')::text);

  v_failed := false;
  begin
    update public.profiles
    set celebrate_birthday = true
    where id = v_staff;
  exception when others then
    v_failed := true;
  end;
  reset role;

  if not v_failed then
    raise exception 'FAIL: Staff member was able to update their own celebrate_birthday flag!';
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 6: Cannot assign inactive user as reports_to
  -- ---------------------------------------------------------------------------
  set local role authenticated;
  execute format('set local "request.jwt.claims" = %L', json_build_object('sub', v_sa::text, 'role', 'authenticated')::text);

  v_failed := false;
  begin
    update public.profiles
    set reports_to = v_inactive
    where id = v_staff;
  exception when others then
    v_failed := true;
  end;
  reset role;

  if not v_failed then
    raise exception 'FAIL: Super admin was able to assign inactive user as reports_to!';
  end if;

  -- ---------------------------------------------------------------------------
  -- PROOF 7: Inactive user excluded from get_staff_leaderboard
  -- ---------------------------------------------------------------------------
  select exists (
    select 1 from public.get_staff_leaderboard('this_month', 'admissions')
    where user_id = v_inactive
  ) into v_found;

  if v_found then
    raise exception 'FAIL: Inactive user appeared in get_staff_leaderboard!';
  end if;

  raise notice '>>> ALL 7 CELEBRATION & INACTIVE PROOFS PASSED <<<';
end $$;

-- Reset celebrations_enabled back to default false
update public.company_settings set celebrations_enabled = false where singleton = true;

rollback;
