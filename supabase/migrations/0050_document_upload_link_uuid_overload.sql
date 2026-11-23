-- ==============================================================================
-- Migration: 0050_document_upload_link_uuid_overload.sql
-- Description:
--   Support both uuid[] and text[] (cast to uuid[]) for create_document_upload_link
--   to match document_upload_links.requested_types (_uuid) column type.
-- ==============================================================================

create or replace function public.create_document_upload_link(
  p_student_id uuid,
  p_requested_types uuid[],
  p_expiry_days int default 7
)
returns public.document_upload_links
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_token text;
  v_expires_at timestamptz;
  v_link public.document_upload_links;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if p_student_id is null or p_requested_types is null or cardinality(p_requested_types) = 0 then
    raise exception 'invalid parameters: student_id and requested_types required';
  end if;

  if public.is_super_admin() or public.is_owner() then
    v_is_authorized := true;
  else
    select exists (
      select 1 from public.students s
      left join public.enrollments e on e.student_id = s.id
      where s.id = p_student_id
        and (
          s.owner_id in (select user_id from public.visible_user_ids())
          or e.admission_staff_id in (select user_id from public.visible_user_ids())
        )
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: candidate outside visible scope';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + (case when p_expiry_days in (3, 7, 14) then p_expiry_days else 7 end || ' days')::interval;

  insert into public.document_upload_links (
    student_id,
    token,
    requested_types,
    expires_at,
    created_by
  )
  values (
    p_student_id,
    v_token,
    p_requested_types,
    v_expires_at,
    v_user_id
  )
  returning * into v_link;

  return v_link;
end;
$$;

revoke all on function public.create_document_upload_link(uuid, uuid[], int) from public, anon;
grant execute on function public.create_document_upload_link(uuid, uuid[], int) to authenticated;

-- text[] overload that delegates with cast to uuid[]
create or replace function public.create_document_upload_link(
  p_student_id uuid,
  p_requested_types text[],
  p_expiry_days int default 7
)
returns public.document_upload_links
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.create_document_upload_link(p_student_id, p_requested_types::uuid[], p_expiry_days);
end;
$$;

revoke all on function public.create_document_upload_link(uuid, text[], int) from public, anon;
grant execute on function public.create_document_upload_link(uuid, text[], int) to authenticated;
