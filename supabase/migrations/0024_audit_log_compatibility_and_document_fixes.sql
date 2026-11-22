-- ============================================================================
-- Migration: 0024_audit_log_compatibility_and_document_fixes.sql
-- Description: Add record_id, user_id, details to audit_log for compatibility
-- with 0021 RPCs, and update verify_candidate_document.
-- ============================================================================

-- 1. Ensure audit_log has compatibility columns
alter table public.audit_log
  add column if not exists record_id uuid,
  add column if not exists user_id uuid,
  add column if not exists details jsonb;

-- Trigger to sync audit_log columns
create or replace function public.trg_sync_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.row_id is null and new.record_id is not null then
    new.row_id := new.record_id;
  end if;
  if new.record_id is null and new.row_id is not null then
    new.record_id := new.row_id;
  end if;
  if new.actor is null and new.user_id is not null then
    new.actor := new.user_id;
  end if;
  if new.user_id is null and new.actor is not null then
    new.user_id := new.actor;
  end if;
  if new.diff is null and new.details is not null then
    new.diff := new.details;
  end if;
  if new.details is null and new.diff is not null then
    new.details := new.diff;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_audit_log on public.audit_log;
create trigger trg_sync_audit_log
  before insert on public.audit_log
  for each row execute function public.trg_sync_audit_log();

-- 2. Update verify_candidate_document
create or replace function public.verify_candidate_document(
  p_document_id uuid,
  p_status text,
  p_notes text default null
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_doc public.candidate_documents;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if p_status not in ('verified', 'rejected', 'received') then
    raise exception 'invalid status: %', p_status;
  end if;

  if public.is_admin_or_above() then
    v_is_authorized := true;
  else
    select exists (
      select 1 from public.candidate_documents cd
      join public.students s on s.id = cd.student_id
      left join public.enrollments e on e.student_id = s.id
      where cd.id = p_document_id
        and (s.created_by = v_user_id or e.admission_staff_id = v_user_id)
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: only Super Admins, Admins, or assigned admission staff can verify or reject documents';
  end if;

  update public.candidate_documents
  set
    status = p_status,
    notes = coalesce(p_notes, notes),
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    verified_by = case when p_status = 'verified' then v_user_id else verified_by end
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  -- Insert into document_access_log
  insert into public.document_access_log (document_id, actor, action, metadata)
  values (
    p_document_id,
    v_user_id::text,
    case when p_status = 'verified' then 'verify' when p_status = 'rejected' then 'reject' else 'view' end,
    jsonb_build_object('notes', p_notes, 'new_status', p_status)
  );

  -- Insert into audit_log
  insert into public.audit_log (action, table_name, record_id, row_id, user_id, actor, details, diff)
  values (
    'verify_candidate_document',
    'candidate_documents',
    p_document_id,
    p_document_id,
    v_user_id,
    v_user_id,
    jsonb_build_object(
      'status', p_status,
      'notes', p_notes,
      'student_id', v_doc.student_id
    ),
    jsonb_build_object(
      'status', p_status,
      'notes', p_notes,
      'student_id', v_doc.student_id
    )
  );

  return v_doc;
end;
$$;

revoke all on function public.verify_candidate_document(uuid, text, text) from public, anon;
grant execute on function public.verify_candidate_document(uuid, text, text) to authenticated;
