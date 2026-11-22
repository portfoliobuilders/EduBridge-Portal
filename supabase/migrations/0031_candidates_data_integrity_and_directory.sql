-- ==============================================================================
-- Migration: 0031_candidates_data_integrity_and_directory.sql
-- Description:
--   1. Data integrity: Add CHECK (student_code ~ '^EB-STU-[0-9]{5}$') NOT VALID
--   2. Strict code generation: Block client-supplied student_code and lock updates
--   3. Search & filter indexes (pg_trgm on full_name, btree on mobile and student_code)
--   4. Refactor student_directory_view (security_invoker = true) with SQL status logic:
--      'No enrollment' · 'Fully paid' · 'Overdue' · 'Balance due'
--   5. get_candidate_directory_kpis() RPC respecting caller role visibility
--   6. delete_test_candidate(uuid) RPC for isolated test candidate cleanup
-- ==============================================================================

-- 1. Check constraint for student_code format (NOT VALID to not block existing dirty test rows before cleanup)
alter table public.students
  drop constraint if exists students_student_code_format_check;

alter table public.students
  add constraint students_student_code_format_check
  check (student_code ~ '^EB-STU-[0-9]{5}$')
  not valid;

-- 2. Strict student_code generator trigger (blocks client-supplied code and locks updates)
create or replace function public.generate_student_code()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_next int;
begin
  if TG_OP = 'INSERT' then
    if new.student_code is not null and new.student_code <> '' then
      raise exception 'Direct assignment of student_code is not permitted; codes must be generated automatically';
    end if;

    update public.student_counters
    set last_no = last_no + 1
    where id = 1
    returning last_no into v_next;

    if not found then
      insert into public.student_counters (id, last_no)
      values (1, 1)
      returning last_no into v_next;
    end if;

    new.student_code := 'EB-STU-' || lpad(v_next::text, 5, '0');
  elsif TG_OP = 'UPDATE' then
    if new.student_code is distinct from old.student_code then
      raise exception 'student_code is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists generate_student_code_trigger on public.students;
create trigger generate_student_code_trigger
before insert or update on public.students
for each row
execute function public.generate_student_code();

-- 3. Search and filtering performance indexes
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_students_full_name_trgm on public.students using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_students_mobile_btree on public.students (mobile);
create index if not exists idx_students_student_code_btree on public.students (student_code);
create index if not exists idx_students_created_by on public.students (created_by);
create index if not exists idx_enrollments_student_status on public.enrollments (student_id, status);
create index if not exists idx_enrollments_uni_course on public.enrollments (university_id, course_id);
create index if not exists idx_payments_valid_enr_paid on public.payments (enrollment_id, paid_at) where status = 'valid';

-- 4. Recreate student_directory_view with SQL Status Logic and Security Invoker
drop view if exists public.student_directory_view cascade;

create view public.student_directory_view
with (security_invoker = true) as
select
  s.id,
  s.student_code,
  s.full_name,
  s.mobile,
  s.whatsapp,
  s.email,
  s.notes,
  s.is_active,
  s.created_by,
  s.created_at,
  s.updated_at,
  case
    when count(e.id) filter (where e.status = 'active') = 0 then 'No enrollment'
    when coalesce(sum(el.balance) filter (where e.status = 'active'), 0) <= 0 then 'Fully paid'
    when coalesce(sum(el.balance) filter (where e.status = 'active'), 0) > 0 and (
      (max(el.last_payment_at) filter (where e.status = 'active') is not null and max(el.last_payment_at) filter (where e.status = 'active') < (now() - interval '30 days'))
      or
      (max(el.last_payment_at) filter (where e.status = 'active') is null and min(e.created_at) filter (where e.status = 'active') < (now() - interval '30 days'))
    ) then 'Overdue'
    else 'Balance due'
  end as candidate_status,
  coalesce(sum(el.balance) filter (where e.status = 'active'), 0)::numeric(12,2) as total_balance,
  coalesce(sum(el.total_paid) filter (where e.status = 'active'), 0)::numeric(12,2) as total_paid,
  coalesce(sum(el.total_payable) filter (where e.status = 'active'), 0)::numeric(12,2) as total_net_fee,
  max(el.last_payment_at) filter (where e.status = 'active') as last_payment_at,
  count(distinct e.id) filter (where e.status = 'active')::int as enrollment_count,
  string_agg(distinct u.name, ', ') filter (where e.status = 'active') as university_names,
  string_agg(distinct c.name, ', ') filter (where e.status = 'active') as course_names,
  array_remove(array_agg(distinct e.university_id) filter (where e.status = 'active'), null) as university_ids,
  array_remove(array_agg(distinct e.course_id) filter (where e.status = 'active'), null) as course_ids,
  (select count(distinct cd.document_type_id) from public.candidate_documents cd where cd.student_id = s.id and cd.archived_at is null)::int as verified_docs_count,
  (select count(*) from public.document_types dt where dt.is_active = true)::int as total_doc_types_count
from public.students s
left join public.enrollments e on e.student_id = s.id
left join public.enrollment_ledger el on el.enrollment_id = e.id
left join public.universities u on u.id = e.university_id
left join public.courses c on c.id = e.course_id
where s.is_active = true
group by s.id;

grant select on public.student_directory_view to authenticated;
revoke all on public.student_directory_view from public, anon;

-- 5. Candidate Directory KPIs RPC (Security Invoker, respects caller RLS visibility)
create or replace function public.get_candidate_directory_kpis()
returns table (
  total_candidates bigint,
  outstanding_balance numeric(12,2),
  collected_this_month numeric(12,2),
  fully_paid_count bigint,
  balance_due_count bigint,
  overdue_count bigint,
  no_enrollment_count bigint
)
language plpgsql
security invoker
set search_path = public, auth, extensions
as $$
declare
  v_month_start timestamptz;
begin
  v_month_start := date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai';

  return query
  with dir as (
    select
      v.id,
      v.candidate_status,
      v.total_balance
    from public.student_directory_view v
  ),
  month_payments as (
    select coalesce(sum(p.amount), 0)::numeric(12,2) as month_collected
    from public.payments p
    where p.status = 'valid'
      and p.paid_at >= v_month_start
  )
  select
    count(*)::bigint as total_candidates,
    coalesce(sum(greatest(0, dir.total_balance)), 0)::numeric(12,2) as outstanding_balance,
    (select month_collected from month_payments)::numeric(12,2) as collected_this_month,
    count(*) filter (where dir.candidate_status = 'Fully paid')::bigint as fully_paid_count,
    count(*) filter (where dir.candidate_status = 'Balance due')::bigint as balance_due_count,
    count(*) filter (where dir.candidate_status = 'Overdue')::bigint as overdue_count,
    count(*) filter (where dir.candidate_status = 'No enrollment')::bigint as no_enrollment_count
  from dir;
end;
$$;

grant execute on function public.get_candidate_directory_kpis() to authenticated;
revoke all on function public.get_candidate_directory_kpis() from public, anon;

-- 6. Isolated test candidate cleanup RPC
create or replace function public.delete_test_candidate(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  delete from public.document_access_log where document_id in (select id from public.candidate_documents where student_id = p_student_id);
  alter table public.candidate_documents disable trigger trg_prevent_candidate_document_delete;
  delete from public.candidate_documents where student_id = p_student_id;
  alter table public.candidate_documents enable trigger trg_prevent_candidate_document_delete;
  delete from public.document_upload_links where student_id = p_student_id;
  delete from public.share_logs where enrollment_id in (select id from public.enrollments where student_id = p_student_id);
  delete from public.payments where enrollment_id in (select id from public.enrollments where student_id = p_student_id);
  delete from public.enrollments where student_id = p_student_id;
  delete from public.student_addresses where student_id = p_student_id;
  delete from public.audit_log where row_id = p_student_id;
  delete from public.students where id = p_student_id;
end;
$$;

grant execute on function public.delete_test_candidate(uuid) to authenticated;
revoke all on function public.delete_test_candidate(uuid) from public, anon;
