-- ============================================================================
-- Migration: 0022_fix_verify_candidate_document.sql
-- Fix: Remove nonexistent rejected_at, rejected_by, rejection_reason columns
-- from verify_candidate_document RPC.
-- ============================================================================

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
    verified_by = case when p_status = 'verified' then v_user_id else verified_by end,
    updated_at = now()
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  insert into public.audit_log (action, table_name, record_id, user_id, details)
  values (
    'verify_candidate_document',
    'candidate_documents',
    p_document_id,
    v_user_id,
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
