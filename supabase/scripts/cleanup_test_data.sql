-- =============================================================================
-- Script: supabase/scripts/cleanup_test_data.sql
-- Removes test and sample records created during Part 4 & Part 5 verification.
-- To be executed before launch.
-- =============================================================================

begin;

-- 1. Remove share logs for test payments/enrollments
delete from public.share_logs
where enrollment_id in (
  'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
  '0eb17428-7b46-45fc-b671-d0d36407ea7b'
);

-- 2. Remove audit logs for test enrollments
delete from public.audit_log
where table_name = 'enrollments'
  and row_id in (
    'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
    '0eb17428-7b46-45fc-b671-d0d36407ea7b'
  );

-- 3. Remove test payments
delete from public.payments
where enrollment_id in (
  'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
  '0eb17428-7b46-45fc-b671-d0d36407ea7b'
) or id in (
  '44fbb19d-4940-49f5-97aa-728d3738e225',
  '9a07b367-c904-4e53-b811-d18a8a8fb849'
);

-- 4. Remove test enrollments
delete from public.enrollments
where id in (
  'a0bed2c6-2271-46f1-bb55-fecd5cfc6700',
  '0eb17428-7b46-45fc-b671-d0d36407ea7b'
);

-- 5. Remove test students
delete from public.students
where id in (
  'bff5d658-061c-4a0c-8bf2-14cc11a60e62',
  'd979862c-cf1e-437b-be4f-13da33f77339'
);

commit;
