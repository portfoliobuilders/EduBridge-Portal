-- =============================================================================
-- Script: supabase/scripts/cleanup_test_data.sql
-- Removes test and sample records created during Part 4, 5, & 6 verification.
-- Resets receipt_counters and student_counters for production launch.
-- Guarded: Aborts with error if any unapproved student or payment exists.
-- DO NOT RUN IN DEVELOPMENT — To be executed by project owner before launch.
-- =============================================================================

/*
  NOTE FOR PROJECT OWNER (DISPOSABLE AUTH USERS):
  In accordance with project security rules, auth.users rows are not deleted
  directly in SQL. After running this script, delete disposable test staff/evaluator
  users via the Supabase Dashboard (Authentication > Users) or via auth.admin.deleteUser:
  - Admissions QA Lead (0d2040ca-6a6b-45c9-872c-4b5763598851)
  - Admissions QA (71984497-fb0d-4242-87d0-6ecbcc824879)
  - Admissions QA (d2405339-1dd2-43fd-bc4b-048b5cfb300e)
  - Test QA Evaluator (b1cee8dd-5399-47e1-9020-d5d9781d3b8b)
  - Test QA Evaluator (db9aceb1-ae72-4a00-b496-fbea9625ce34)
  - Admissions QA Lead (915cad32-4fb3-40c0-a628-0b7f8caeb66c)
*/

begin;

-- =============================================================================
-- GUARD: Abort if any payment or student exists outside the known test list
-- =============================================================================
do $$
declare
  v_unexpected_students int;
  v_unexpected_payments int;
begin
  -- Check for any unexpected students
  select count(*) into v_unexpected_students
  from public.students
  where id not in (
    'bff5d658-061c-4a0c-8bf2-14cc11a60e62'::uuid,
    'd979862c-cf1e-437b-be4f-13da33f77339'::uuid,
    '4dfecda1-8ab3-459b-9a67-a1a090b0a5f1'::uuid,
    'b8c55230-bf66-4e60-a6f9-e502a968d6cc'::uuid,
    '35c5e027-99f2-45a9-87de-1b82ce96e75c'::uuid,
    'd861a637-fcdf-4228-9f29-192464ef50f9'::uuid,
    '182135cb-d4dc-4e2d-8b68-64c74b608f05'::uuid,
    '8e0d5d72-6f9a-487c-9417-53191b608a97'::uuid,
    'e5e5fcec-9708-443b-a266-b3545afc4081'::uuid,
    '7d445c12-7271-4c3a-8f09-1d0e0f6b2cae'::uuid,
    '01b0ce44-7a69-4cae-93cc-8120607e1512'::uuid,
    'b2bb8b35-34dc-4b7b-8555-4a7f305f95bb'::uuid,
    -- EB-DOC test candidates
    'fa35fc91-36d5-40eb-b257-5c683ed40a4a'::uuid,
    '7c86db38-b93e-4b0a-80e8-95c210027631'::uuid,
    'a75c0756-728a-4f26-826a-5cccf9c29154'::uuid,
    '7159888d-36f4-4556-a9aa-a3d40ff3b84a'::uuid,
    'ac5ecced-4318-41b5-927d-8612347926d8'::uuid,
    '7f8d656b-cf6e-4a37-ad56-c76405e1998b'::uuid,
    '8992df4a-93ff-4aed-9337-07769ff6e4f0'::uuid
  );
  if v_unexpected_students > 0 then
    raise exception 'CLEANUP ABORTED: Found % student(s) not in approved test-ID list', v_unexpected_students;
  end if;

  -- Check for any unexpected payments
  select count(*) into v_unexpected_payments
  from public.payments
  where id not in (
    '795eba12-660c-4fbb-b3c7-be2c7a7717df'::uuid,
    'ec918885-090e-4558-8898-9638720ce8ab'::uuid,
    '44fbb19d-4940-49f5-97aa-728d3738e225'::uuid,
    '9a07b367-c904-4e53-b811-d18a8a8fb849'::uuid,
    '7df5de6f-d718-409b-a7c2-37424293ec2f'::uuid,
    'f618fe29-66ac-4e70-88b5-c5bb010885ee'::uuid,
    '3ee55f10-9a19-43af-8b48-e1b4319ecd35'::uuid,
    '105daccc-dbe8-4f27-8e15-2900f15a7f4f'::uuid,
    '49e67be4-1156-43ba-b79e-2dde6f094150'::uuid
  );
  if v_unexpected_payments > 0 then
    raise exception 'CLEANUP ABORTED: Found % payment(s) not in approved test-ID list', v_unexpected_payments;
  end if;
end $$;

-- 1. Remove share logs for test payments/enrollments
delete from public.share_logs
where enrollment_id in (
  'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
  '0eb17428-7b46-45fc-b671-d0d36407ea7b',
  '18cb7780-8c5c-495a-be6f-0e4951e01e05',
  'b273d00e-f381-4f0f-ae4c-e2667627cfeb',
  'bbc4bf2a-086e-4246-89b7-45c015721b63',
  '07102dd2-d55e-4623-b5b3-1c004a1146b4',
  '6ead5fec-096a-4899-9e62-11c8b76e868b',
  '82ea3709-f719-4565-9040-5235f3463951',
  '937f4036-5433-410f-97f4-629e23eefad6',
  '8f2507bd-f6fe-474f-96b4-84a7eb3a0827',
  '497f9976-cb1b-414d-a906-f1c9d6e89961'
) or payment_id in (
  '795eba12-660c-4fbb-b3c7-be2c7a7717df',
  'ec918885-090e-4558-8898-9638720ce8ab',
  '44fbb19d-4940-49f5-97aa-728d3738e225',
  '9a07b367-c904-4e53-b811-d18a8a8fb849',
  '7df5de6f-d718-409b-a7c2-37424293ec2f',
  'f618fe29-66ac-4e70-88b5-c5bb010885ee',
  '3ee55f10-9a19-43af-8b48-e1b4319ecd35',
  '105daccc-dbe8-4f27-8e15-2900f15a7f4f',
  '49e67be4-1156-43ba-b79e-2dde6f094150'
);

-- 2. Remove audit logs for test enrollments and students
delete from public.audit_log
where (
  table_name = 'enrollments'
  and row_id in (
    'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
    '0eb17428-7b46-45fc-b671-d0d36407ea7b',
    '18cb7780-8c5c-495a-be6f-0e4951e01e05',
    'b273d00e-f381-4f0f-ae4c-e2667627cfeb',
    'bbc4bf2a-086e-4246-89b7-45c015721b63',
    '07102dd2-d55e-4623-b5b3-1c004a1146b4',
    '6ead5fec-096a-4899-9e62-11c8b76e868b',
    '82ea3709-f719-4565-9040-5235f3463951',
    '937f4036-5433-410f-97f4-629e23eefad6',
    '8f2507bd-f6fe-474f-96b4-84a7eb3a0827',
    '497f9976-cb1b-414d-a906-f1c9d6e89961'
  )
) or (
  table_name = 'students'
  and row_id in (
    'bff5d658-061c-4a0c-8bf2-14cc11a60e62',
    'd979862c-cf1e-437b-be4f-13da33f77339',
    '4dfecda1-8ab3-459b-9a67-a1a090b0a5f1',
    'b8c55230-bf66-4e60-a6f9-e502a968d6cc',
    '35c5e027-99f2-45a9-87de-1b82ce96e75c',
    'd861a637-fcdf-4228-9f29-192464ef50f9',
    '182135cb-d4dc-4e2d-8b68-64c74b608f05',
    '8e0d5d72-6f9a-487c-9417-53191b608a97',
    'e5e5fcec-9708-443b-a266-b3545afc4081',
    '7d445c12-7271-4c3a-8f09-1d0e0f6b2cae',
    '01b0ce44-7a69-4cae-93cc-8120607e1512',
    'b2bb8b35-34dc-4b7b-8555-4a7f305f95bb',
    'fa35fc91-36d5-40eb-b257-5c683ed40a4a',
    '7c86db38-b93e-4b0a-80e8-95c210027631',
    'a75c0756-728a-4f26-826a-5cccf9c29154',
    '7159888d-36f4-4556-a9aa-a3d40ff3b84a',
    'ac5ecced-4318-41b5-927d-8612347926d8',
    '7f8d656b-cf6e-4a37-ad56-c76405e1998b',
    '8992df4a-93ff-4aed-9337-07769ff6e4f0'
  )
);

-- 2b. Remove test candidate documents and upload links
delete from public.document_access_log
where document_id in (
  select id from public.candidate_documents
  where student_id in (
    'fa35fc91-36d5-40eb-b257-5c683ed40a4a',
    '7c86db38-b93e-4b0a-80e8-95c210027631',
    'a75c0756-728a-4f26-826a-5cccf9c29154',
    '7159888d-36f4-4556-a9aa-a3d40ff3b84a',
    'ac5ecced-4318-41b5-927d-8612347926d8',
    '7f8d656b-cf6e-4a37-ad56-c76405e1998b',
    '8992df4a-93ff-4aed-9337-07769ff6e4f0'
  )
);

alter table public.candidate_documents disable trigger trg_prevent_candidate_document_delete;

delete from public.candidate_documents
where student_id in (
  'fa35fc91-36d5-40eb-b257-5c683ed40a4a',
  '7c86db38-b93e-4b0a-80e8-95c210027631',
  'a75c0756-728a-4f26-826a-5cccf9c29154',
  '7159888d-36f4-4556-a9aa-a3d40ff3b84a',
  'ac5ecced-4318-41b5-927d-8612347926d8',
  '7f8d656b-cf6e-4a37-ad56-c76405e1998b',
  '8992df4a-93ff-4aed-9337-07769ff6e4f0'
);

alter table public.candidate_documents enable trigger trg_prevent_candidate_document_delete;

delete from public.document_upload_links
where student_id in (
  'fa35fc91-36d5-40eb-b257-5c683ed40a4a',
  '7c86db38-b93e-4b0a-80e8-95c210027631',
  'a75c0756-728a-4f26-826a-5cccf9c29154',
  '7159888d-36f4-4556-a9aa-a3d40ff3b84a',
  'ac5ecced-4318-41b5-927d-8612347926d8',
  '7f8d656b-cf6e-4a37-ad56-c76405e1998b',
  '8992df4a-93ff-4aed-9337-07769ff6e4f0'
);

-- 3. Remove test payments
delete from public.payments
where enrollment_id in (
  'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
  '0eb17428-7b46-45fc-b671-d0d36407ea7b',
  '18cb7780-8c5c-495a-be6f-0e4951e01e05',
  'b273d00e-f381-4f0f-ae4c-e2667627cfeb',
  'bbc4bf2a-086e-4246-89b7-45c015721b63',
  '07102dd2-d55e-4623-b5b3-1c004a1146b4',
  '6ead5fec-096a-4899-9e62-11c8b76e868b',
  '82ea3709-f719-4565-9040-5235f3463951',
  '937f4036-5433-410f-97f4-629e23eefad6',
  '8f2507bd-f6fe-474f-96b4-84a7eb3a0827',
  '497f9976-cb1b-414d-a906-f1c9d6e89961'
) or id in (
  '795eba12-660c-4fbb-b3c7-be2c7a7717df',
  'ec918885-090e-4558-8898-9638720ce8ab',
  '44fbb19d-4940-49f5-97aa-728d3738e225',
  '9a07b367-c904-4e53-b811-d18a8a8fb849',
  '7df5de6f-d718-409b-a7c2-37424293ec2f',
  'f618fe29-66ac-4e70-88b5-c5bb010885ee',
  '3ee55f10-9a19-43af-8b48-e1b4319ecd35',
  '105daccc-dbe8-4f27-8e15-2900f15a7f4f',
  '49e67be4-1156-43ba-b79e-2dde6f094150'
);

-- 4. Remove test student addresses
delete from public.student_addresses
where student_id in (
  'bff5d658-061c-4a0c-8bf2-14cc11a60e62',
  'd979862c-cf1e-437b-be4f-13da33f77339',
  '4dfecda1-8ab3-459b-9a67-a1a090b0a5f1',
  'b8c55230-bf66-4e60-a6f9-e502a968d6cc',
  '35c5e027-99f2-45a9-87de-1b82ce96e75c',
  'd861a637-fcdf-4228-9f29-192464ef50f9',
  '182135cb-d4dc-4e2d-8b68-64c74b608f05',
  '8e0d5d72-6f9a-487c-9417-53191b608a97',
  'e5e5fcec-9708-443b-a266-b3545afc4081',
  '7d445c12-7271-4c3a-8f09-1d0e0f6b2cae',
  '01b0ce44-7a69-4cae-93cc-8120607e1512',
  'b2bb8b35-34dc-4b7b-8555-4a7f305f95bb',
  'fa35fc91-36d5-40eb-b257-5c683ed40a4a',
  '7c86db38-b93e-4b0a-80e8-95c210027631',
  'a75c0756-728a-4f26-826a-5cccf9c29154',
  '7159888d-36f4-4556-a9aa-a3d40ff3b84a',
  'ac5ecced-4318-41b5-927d-8612347926d8',
  '7f8d656b-cf6e-4a37-ad56-c76405e1998b',
  '8992df4a-93ff-4aed-9337-07769ff6e4f0'
);

-- 5. Remove test enrollments
delete from public.enrollments
where id in (
  'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
  '0eb17428-7b46-45fc-b671-d0d36407ea7b',
  '18cb7780-8c5c-495a-be6f-0e4951e01e05',
  'b273d00e-f381-4f0f-ae4c-e2667627cfeb',
  'bbc4bf2a-086e-4246-89b7-45c015721b63',
  '07102dd2-d55e-4623-b5b3-1c004a1146b4',
  '6ead5fec-096a-4899-9e62-11c8b76e868b',
  '82ea3709-f719-4565-9040-5235f3463951',
  '937f4036-5433-410f-97f4-629e23eefad6',
  '8f2507bd-f6fe-474f-96b4-84a7eb3a0827',
  '497f9976-cb1b-414d-a906-f1c9d6e89961'
);

-- 6. Remove test students
delete from public.students
where id in (
  'bff5d658-061c-4a0c-8bf2-14cc11a60e62',
  'd979862c-cf1e-437b-be4f-13da33f77339',
  '4dfecda1-8ab3-459b-9a67-a1a090b0a5f1',
  'b8c55230-bf66-4e60-a6f9-e502a968d6cc',
  '35c5e027-99f2-45a9-87de-1b82ce96e75c',
  'd861a637-fcdf-4228-9f29-192464ef50f9',
  '182135cb-d4dc-4e2d-8b68-64c74b608f05',
  '8e0d5d72-6f9a-487c-9417-53191b608a97',
  'e5e5fcec-9708-443b-a266-b3545afc4081',
  '7d445c12-7271-4c3a-8f09-1d0e0f6b2cae',
  '01b0ce44-7a69-4cae-93cc-8120607e1512',
  'b2bb8b35-34dc-4b7b-8555-4a7f305f95bb',
  'fa35fc91-36d5-40eb-b257-5c683ed40a4a',
  '7c86db38-b93e-4b0a-80e8-95c210027631',
  'a75c0756-728a-4f26-826a-5cccf9c29154',
  '7159888d-36f4-4556-a9aa-a3d40ff3b84a',
  'ac5ecced-4318-41b5-927d-8612347926d8',
  '7f8d656b-cf6e-4a37-ad56-c76405e1998b',
  '8992df4a-93ff-4aed-9337-07769ff6e4f0'
);

-- 7. Reset receipt counters so the next receipt will be EB-RV-<year>-00001
delete from public.receipt_counters;

-- 8. Reset student counter so the next candidate will be EB-STU-00001
update public.student_counters set last_no = 0 where id = 1;

-- 9. Clean up rate limit tables
delete from public.email_rate_limits;
delete from public.public_rate_limits;

commit;
