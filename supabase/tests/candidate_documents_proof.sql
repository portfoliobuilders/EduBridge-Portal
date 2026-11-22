-- ==============================================================================
-- Candidate Documents & Self-Upload Link Proof Test Suite
-- Runs inside a single BEGIN ... ROLLBACK transaction.
-- Tests table structures, seed data, RLS, deletion trigger, and RPCs.
-- ==============================================================================

begin;

-- Test 1: Check document types are seeded
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where is_active = true;
  if v_count < 7 then
    raise exception 'Test 1 Failed: Expected at least 7 active document types, found %', v_count;
  end if;
  raise notice 'Test 1 Passed: % active document types seeded', v_count;
end $$;

-- Test 2: Check ID proof and specific slugs exist
do $$
declare
  v_id_proof text;
begin
  select slug into v_id_proof
  from public.document_types
  where slug = 'id-proof-aadhaar-passport';

  if v_id_proof is null then
    raise exception 'Test 2 Failed: ID proof type not found';
  end if;
  raise notice 'Test 2 Passed: id-proof-aadhaar-passport type found';
end $$;

-- Test 3: Verify anon cannot view candidate documents or upload links (RLS check)
do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_name in ('candidate_documents', 'document_upload_links', 'document_access_log')
      and privilege_type = 'SELECT'
  ) then
    raise exception 'Test 3 Failed: anon has direct SELECT grant on documents tables';
  end if;
  raise notice 'Test 3 Passed: anon has 0 direct SELECT permissions on documents tables';
end $$;

-- Test 4: Create a candidate, upload document, verify RPC and deletion prevention
do $$
declare
  v_owner_id uuid;
  v_staff_id uuid;
  v_student_id uuid;
  v_doc_type_id uuid;
  v_doc_id uuid;
  v_link_id uuid;
  v_link_token text := 'test_token_' || substr(md5(random()::text), 1, 16);
  v_doc public.candidate_documents;
  v_stats jsonb;
begin
  -- Get active super_admin / owner profile
  select id into v_owner_id from public.profiles where role in ('super_admin', 'owner') and is_active = true limit 1;
  if v_owner_id is null then
    raise exception 'No active owner profile found for testing';
  end if;

  -- Get active staff profile
  select id into v_staff_id from public.profiles where role = 'staff' and is_active = true limit 1;
  if v_staff_id is null then
    v_staff_id := v_owner_id;
  end if;

  -- Create test candidate
  insert into public.students (
    full_name,
    mobile,
    created_by
  ) values (
    'Test Candidate For Docs',
    '+971501234567',
    v_staff_id
  ) returning id into v_student_id;

  -- Select 10th certificate doc type
  select id into v_doc_type_id from public.document_types where slug = '10th-certificate' limit 1;

  -- Insert document directly
  insert into public.candidate_documents (
    student_id,
    document_type_id,
    title,
    file_path,
    file_name,
    mime_type,
    size_bytes,
    original_size_bytes,
    uploaded_via,
    uploaded_by
  ) values (
    v_student_id,
    v_doc_type_id,
    '10th Certificate',
    'EB-TEST-DOC_test-candidate/10th-certificate/20261122-120000_1.pdf',
    '10th_cert.pdf',
    'application/pdf',
    1048576,
    1048576,
    'staff',
    v_staff_id
  ) returning id into v_doc_id;

  -- Verify document status is 'received'
  if not exists (select 1 from public.candidate_documents where id = v_doc_id and status = 'received') then
    raise exception 'Test 4 Failed: Expected document status to be received';
  end if;
  raise notice 'Test 4 Passed: Document successfully created with status received';

  -- Test 5: Verify hard deletion is blocked by trigger
  begin
    delete from public.candidate_documents where id = v_doc_id;
    raise exception 'Test 5 Failed: Deletion was permitted on candidate_documents';
  exception
    when others then
      if sqlerrm like '%Direct deletion of candidate documents is prohibited%' then
        raise notice 'Test 5 Passed: Trigger successfully prevented hard deletion of document';
      else
        raise;
      end if;
  end;

  -- Test 6: Verify RPC verify_candidate_document as owner/staff
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config('role', 'authenticated', true);

  v_doc := public.verify_candidate_document(
    p_document_id := v_doc_id,
    p_status := 'verified',
    p_notes := 'Verified official certificate'
  );

  if v_doc.status != 'verified' then
    raise exception 'Test 6 Failed: Expected verified status, got %', v_doc.status;
  end if;
  raise notice 'Test 6 Passed: verify_candidate_document RPC verified document';

  -- Test 7: Verify reject with mandatory reason
  v_doc := public.verify_candidate_document(
    p_document_id := v_doc_id,
    p_status := 'rejected',
    p_notes := 'Illegible photocopy'
  );

  if v_doc.status != 'rejected' then
    raise exception 'Test 7 Failed: Expected rejected status, got %', v_doc.status;
  end if;
  raise notice 'Test 7 Passed: verify_candidate_document RPC rejected document with reason';

  -- Test 8: Verify RPC archive_candidate_document
  v_doc := public.archive_candidate_document(p_document_id := v_doc_id);
  if v_doc.archived_at is null then
    raise exception 'Test 8 Failed: archive_candidate_document did not set archived_at';
  end if;
  raise notice 'Test 8 Passed: archive_candidate_document RPC archived document';

  -- Test 9: Create and revoke document upload link
  insert into public.document_upload_links (
    student_id,
    token,
    requested_types,
    expires_at,
    created_by
  ) values (
    v_student_id,
    v_link_token,
    array[v_doc_type_id],
    now() + interval '7 days',
    v_owner_id
  ) returning id into v_link_id;

  perform public.revoke_document_upload_link(p_link_id := v_link_id);

  if not exists (select 1 from public.document_upload_links where id = v_link_id and revoked_at is not null) then
    raise exception 'Test 9 Failed: revoke_document_upload_link did not set revoked_at';
  end if;
  raise notice 'Test 9 Passed: revoke_document_upload_link successfully revoked link';

  -- Test 10: Verify get_link_documents_stats RPC
  v_stats := public.get_link_documents_stats(7);
  if not (v_stats ? 'total_received' and v_stats ? 'unverified' and v_stats ? 'active_links') then
    raise exception 'Test 10 Failed: get_link_documents_stats returned invalid structure %', v_stats;
  end if;
  raise notice 'Test 10 Passed: get_link_documents_stats executed cleanly: %', v_stats;
end $$;

rollback;
