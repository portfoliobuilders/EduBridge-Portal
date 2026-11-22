-- Migration 0016: Security & Performance Advisors Fixes
-- 1. Drop duplicate index on enrollments(admission_staff_id)
-- 2. Wrap auth.uid() in (select auth.uid()) across RLS policies to prevent per-row re-evaluation (auth_rls_initplan)

-- Drop duplicate index
drop index if exists public.idx_enrollments_admission_staff_id;

-- 1. profiles policies
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  to authenticated
  using ((id = (select auth.uid())) or is_owner());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  to authenticated
  using ((id = (select auth.uid())) or is_owner())
  with check ((id = (select auth.uid())) or is_owner());

-- 2. students policies
drop policy if exists students_insert on public.students;
create policy students_insert on public.students
  for insert
  to authenticated
  with check (is_active_user() and (created_by = (select auth.uid())));

drop policy if exists students_update on public.students;
create policy students_update on public.students
  for update
  to authenticated
  using (is_owner() or (created_by = (select auth.uid())))
  with check (is_owner() or (created_by = (select auth.uid())));

-- 3. student_addresses policies
drop policy if exists student_addresses_insert on public.student_addresses;
create policy student_addresses_insert on public.student_addresses
  for insert
  to authenticated
  with check (is_active_user() and (created_by = (select auth.uid())));

drop policy if exists student_addresses_update on public.student_addresses;
create policy student_addresses_update on public.student_addresses
  for update
  to authenticated
  using (is_owner() or (exists (
    select 1 from public.students s
    where s.id = student_addresses.student_id
      and s.created_by = (select auth.uid())
  )))
  with check (is_owner() or (exists (
    select 1 from public.students s
    where s.id = student_addresses.student_id
      and s.created_by = (select auth.uid())
  )));

-- 4. enrollments policies
drop policy if exists enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments
  for insert
  to authenticated
  with check (is_active_user() and (created_by = (select auth.uid())));

-- 5. email_rate_limits policies
drop policy if exists email_rate_limits_select on public.email_rate_limits;
create policy email_rate_limits_select on public.email_rate_limits
  for select
  to authenticated
  using ((user_id = (select auth.uid())) or is_owner());

drop policy if exists email_rate_limits_insert on public.email_rate_limits;
create policy email_rate_limits_insert on public.email_rate_limits
  for insert
  to authenticated
  with check ((user_id = (select auth.uid())) and is_active_user());
