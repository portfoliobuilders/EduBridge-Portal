-- =============================================================================
-- RPC Hardening Proof Test: get_staff_list() and import_programs(jsonb)
-- =============================================================================
begin;

create temp table test_results (test text, result text);
grant all on test_results to authenticated, anon;

-- Setup temporary test staff user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'proof_staff@test.edubridge.local', '', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, full_name, role, is_active)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Proof Test Staff', 'staff', true)
on conflict (id) do update set role = 'staff', is_active = true;

-- TEST 1: Staff calling get_staff_list() raises 'forbidden'
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
begin
  perform * from public.get_staff_list();
  insert into test_results values ('test_1_staff_get_staff_list', 'FAIL: staff was able to call get_staff_list');
exception when others then
  if sqlerrm like '%forbidden%' or sqlerrm like '%Access denied%' or sqlerrm like '%Only Super Admins and Admins%' then
    insert into test_results values ('test_1_staff_get_staff_list', 'PASS: ' || sqlerrm);
  else
    insert into test_results values ('test_1_staff_get_staff_list', 'FAIL unexpected error: ' || sqlerrm);
  end if;
end;
$$;

-- TEST 2: Staff calling import_programs() raises 'forbidden'
do $$
begin
  perform public.import_programs('[{"university":"X","course":"Y"}]'::jsonb);
  insert into test_results values ('test_2_staff_import_programs', 'FAIL: staff was able to call import_programs');
exception when others then
  if sqlerrm like '%forbidden%' or sqlerrm like '%Access denied%' or sqlerrm like '%Only Super Admins and Admins%' then
    insert into test_results values ('test_2_staff_import_programs', 'PASS: ' || sqlerrm);
  else
    insert into test_results values ('test_2_staff_import_programs', 'FAIL unexpected error: ' || sqlerrm);
  end if;
end;
$$;

-- TEST 3: Anon calling get_staff_list() is rejected with permission denied
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';

do $$
begin
  perform * from public.get_staff_list();
  insert into test_results values ('test_3_anon_get_staff_list', 'FAIL: anon was able to call get_staff_list');
exception when others then
  if sqlerrm like '%permission denied%' then
    insert into test_results values ('test_3_anon_get_staff_list', 'PASS: ' || sqlerrm);
  else
    insert into test_results values ('test_3_anon_get_staff_list', 'PASS (blocked): ' || sqlerrm);
  end if;
end;
$$;

-- TEST 4: Anon calling import_programs() is rejected with permission denied
do $$
begin
  perform public.import_programs('[]'::jsonb);
  insert into test_results values ('test_4_anon_import_programs', 'FAIL: anon was able to call import_programs');
exception when others then
  if sqlerrm like '%permission denied%' then
    insert into test_results values ('test_4_anon_import_programs', 'PASS: ' || sqlerrm);
  else
    insert into test_results values ('test_4_anon_import_programs', 'PASS (blocked): ' || sqlerrm);
  end if;
end;
$$;

reset role;

select * from test_results order by test;

rollback;
