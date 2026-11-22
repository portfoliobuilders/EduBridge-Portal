-- ==============================================================================
-- Migration: 0046_fix_payments_and_documents_rls_ownership.sql
-- Description:
--   Strict ownership RLS for payments and candidate_documents.
--   Ensures staff cannot view payments or documents belonging to another staff member's candidates.
-- ==============================================================================

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
for select using (
  is_super_admin()
  or is_owner()
  or (received_by in (select user_id from public.visible_user_ids()))
  or (exists (
    select 1 from public.enrollments e
    where e.id = payments.enrollment_id
      and (
        e.admission_staff_id in (select user_id from public.visible_user_ids())
        or exists (
          select 1 from public.students s
          where s.id = e.student_id
            and s.owner_id in (select user_id from public.visible_user_ids())
        )
      )
  ))
);

drop policy if exists "Staff can view candidate documents" on public.candidate_documents;
create policy "Staff can view candidate documents" on public.candidate_documents
for select using (
  is_super_admin()
  or is_owner()
  or (uploaded_by in (select user_id from public.visible_user_ids()))
  or (exists (
    select 1 from public.students s
    where s.id = candidate_documents.student_id
      and (
        s.owner_id in (select user_id from public.visible_user_ids())
        or exists (
          select 1 from public.enrollments e
          where e.student_id = s.id
            and e.admission_staff_id in (select user_id from public.visible_user_ids())
        )
      )
  ))
);
