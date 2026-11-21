-- =============================================================================
-- Guard Profile Updates Bypass Proof Test (begin...rollback)
-- =============================================================================
begin;

-- Create temporary output table to collect test results
create temp table test_output (test text, result text);
grant all on test_output to authenticated, anon;

-- Setup test staff user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'test_guard_staff@edubridge.test', '', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, full_name, role, is_active)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Guard Test Staff', 'staff', true)
on conflict (id) do nothing;

-- TEST 1: authenticated staff cannot self-promote to owner
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
begin
  update profiles set role = 'owner' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  insert into test_output values ('test_1_staff_self_promote', 'FAIL: staff was able to self promote');
exception when others then
  if sqlerrm like '%Only owners can modify%' then
    insert into test_output values ('test_1_staff_self_promote', 'PASS: ' || sqlerrm);
  else
    insert into test_output values ('test_1_staff_self_promote', 'FAIL unexpected: ' || sqlerrm);
  end if;
end;
$$;

-- TEST 2: anon cannot update profiles (fails via RLS or privilege)
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';

do $$
declare
  v_rows int;
begin
  update profiles set role = 'owner' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into test_output values ('test_2_anon_update', 'PASS: Anon update blocked (0 rows affected)');
  else
    insert into test_output values ('test_2_anon_update', 'FAIL: Anon updated ' || v_rows || ' row(s)');
  end if;
exception when others then
  insert into test_output values ('test_2_anon_update', 'PASS: ' || sqlerrm);
end;
$$;

-- Reset role to postgres for reading results
reset role;

select * from test_output order by test;

rollback;
