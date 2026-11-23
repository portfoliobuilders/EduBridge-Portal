-- ==============================================================================
-- Migration: 0049_phase3_admin_escalation_and_document_scope.sql
-- Description:
--   1. Harden guard_profile_admin_fields trigger:
--      - Caller with NULL role or inactive profile is strictly forbidden.
--      - Super Admin demotion/deactivation blocked if last active super_admin.
--      - Admins cannot edit own administrative / privileged fields (role, scope, reports_to, is_active, is_support, work_email, job_title, employee_id, joining_date).
--      - Admins cannot edit super_admins or other admins.
--      - Admins can only edit STAFF within visible_user_ids() scope.
--      - Admins cannot change role (promote to admin/super_admin), admin_scope, is_support, or work_email.
--      - Admins can only assign reports_to to a user within visible_user_ids().
--   2. Align document RPCs and RLS with 0046 ownership model:
--      - verify_candidate_document, archive_candidate_document, revoke_document_upload_link,
--        and create_document_upload_link: super_admin any; admin where candidate owner_id
--        or admission_staff_id is in visible_user_ids(); staff where owner_id = uid or
--        admission_staff_id = uid (NOT created_by).
--      - Update RLS on candidate_documents and document_upload_links to match.
--   3. Attendance punch delete protection & test cleanup:
--      - Allow trg_prevent_attendance_punch_delete bypass only when session setting
--        app.allow_test_data_cleanup = 'true' AND current_user in ('postgres', 'service_role').
--      - Add cleanup_test_attendance_user RPC for test user cleanup.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROFILE ADMIN FIELDS GUARD TRIGGER
-- ------------------------------------------------------------------------------
create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_caller_active boolean;
  v_caller_id uuid := auth.uid();
begin
  -- Bypass only when no authenticated caller context (migrations, system seeds run directly as postgres)
  if v_caller_id is null then
    return new;
  end if;

  select role::text, is_active into v_caller_role, v_caller_active
  from public.profiles
  where id = v_caller_id;

  -- Forbidden if caller has no profile row or is inactive
  if v_caller_role is null or v_caller_active is not true then
    raise exception 'forbidden: caller has no active profile';
  end if;

  -- 1. SUPER_ADMIN / OWNER: full privileges except cannot demote or deactivate the last active super_admin
  if v_caller_role in ('super_admin', 'owner') then
    if old.role::text in ('super_admin', 'owner') and old.is_active = true and
       (new.role::text not in ('super_admin', 'owner') or new.is_active = false) then
      if (select count(*) from public.profiles where role in ('super_admin', 'owner') and is_active = true and id != old.id) < 1 then
        raise exception 'forbidden: cannot deactivate or demote the last active super_admin';
      end if;
    end if;
    return new;
  end if;

  -- 2. ADMIN: strictly scoped
  if v_caller_role = 'admin' then
    -- Admin updating their own profile
    if old.id = v_caller_id then
      if (new.role is distinct from old.role) or
         (new.admin_scope is distinct from old.admin_scope) or
         (new.reports_to is distinct from old.reports_to) or
         (new.is_active is distinct from old.is_active) or
         (new.is_support is distinct from old.is_support) or
         (new.work_email is distinct from old.work_email) or
         (new.job_title is distinct from old.job_title) or
         (new.employee_id is distinct from old.employee_id) or
         (new.joining_date is distinct from old.joining_date) then
        raise exception 'forbidden: admins cannot modify own administrative or privileged fields';
      end if;
      return new;
    end if;

    -- Admin updating another profile
    -- Must only update staff members (cannot edit other admins or super_admins)
    if old.role::text != 'staff' then
      raise exception 'forbidden: admins can only manage staff members';
    end if;

    -- Must be within admin's visible scope
    if not (old.id in (select user_id from public.visible_user_ids())) then
      raise exception 'forbidden: staff member is outside your administrative scope';
    end if;

    -- Cannot change role (no promotion to admin/super_admin)
    if new.role is distinct from old.role then
      raise exception 'forbidden: admins cannot change roles';
    end if;

    -- Cannot change admin_scope, is_support, work_email
    if new.admin_scope is distinct from old.admin_scope then
      raise exception 'forbidden: admins cannot configure admin scope';
    end if;

    if new.is_support is distinct from old.is_support then
      raise exception 'forbidden: admins cannot configure support flag';
    end if;

    if new.work_email is distinct from old.work_email then
      raise exception 'forbidden: admins cannot change work email';
    end if;

    -- reports_to can only be set to someone within visible scope (or null)
    if new.reports_to is distinct from old.reports_to and new.reports_to is not null then
      if not (new.reports_to in (select user_id from public.visible_user_ids())) then
        raise exception 'forbidden: cannot assign reports_to outside your administrative scope';
      end if;
    end if;

    -- Allowed privileged fields for admin on staff: job_title, employee_id, joining_date, reports_to (in scope), is_active
    return new;
  end if;

  -- 3. STAFF / OTHER ROLES
  if old.id != v_caller_id then
    raise exception 'forbidden: staff cannot modify other profiles';
  end if;

  if (new.job_title is distinct from old.job_title) or
     (new.employee_id is distinct from old.employee_id) or
     (new.joining_date is distinct from old.joining_date) or
     (new.role is distinct from old.role) or
     (new.admin_scope is distinct from old.admin_scope) or
     (new.reports_to is distinct from old.reports_to) or
     (new.is_active is distinct from old.is_active) or
     (new.is_support is distinct from old.is_support) or
     (new.work_email is distinct from old.work_email) then
    raise exception 'forbidden: only administrators can modify job title, employee ID, joining date, or role fields';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. DOCUMENT ACTIONS & RPCS (Strict Ownership Matching 0046 Model)
-- ------------------------------------------------------------------------------

-- Create Document Upload Link RPC
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

revoke all on function public.create_document_upload_link(uuid, text[], int) from public, anon;
grant execute on function public.create_document_upload_link(uuid, text[], int) to authenticated;

-- Revoke Document Upload Link RPC
create or replace function public.revoke_document_upload_link(
  p_link_id uuid
)
returns public.document_upload_links
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_link public.document_upload_links;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if public.is_super_admin() or public.is_owner() then
    v_is_authorized := true;
  else
    select exists (
      select 1 from public.document_upload_links dul
      join public.students s on s.id = dul.student_id
      left join public.enrollments e on e.student_id = s.id
      where dul.id = p_link_id
        and (
          s.owner_id in (select user_id from public.visible_user_ids())
          or e.admission_staff_id in (select user_id from public.visible_user_ids())
        )
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: candidate outside visible scope';
  end if;

  update public.document_upload_links
  set revoked_at = now()
  where id = p_link_id
  returning * into v_link;

  if not found then
    raise exception 'link not found';
  end if;

  return v_link;
end;
$$;

revoke all on function public.revoke_document_upload_link(uuid) from public, anon;
grant execute on function public.revoke_document_upload_link(uuid) to authenticated;

-- Archive Candidate Document RPC
create or replace function public.archive_candidate_document(
  p_document_id uuid
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_doc public.candidate_documents;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if public.is_super_admin() or public.is_owner() then
    v_is_authorized := true;
  else
    select exists (
      select 1 from public.candidate_documents cd
      join public.students s on s.id = cd.student_id
      left join public.enrollments e on e.student_id = s.id
      where cd.id = p_document_id
        and (
          s.owner_id in (select user_id from public.visible_user_ids())
          or e.admission_staff_id in (select user_id from public.visible_user_ids())
        )
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: candidate outside visible scope';
  end if;

  update public.candidate_documents
  set archived_at = now()
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  -- Log action
  insert into public.document_access_log (document_id, actor, action)
  values (p_document_id, v_user_id::text, 'archive');

  return v_doc;
end;
$$;

revoke all on function public.archive_candidate_document(uuid) from public, anon;
grant execute on function public.archive_candidate_document(uuid) to authenticated;

-- Verify Candidate Document RPC
create or replace function public.verify_candidate_document(
  p_document_id uuid,
  p_status text,
  p_notes text default null
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public, auth
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

  if public.is_super_admin() or public.is_owner() then
    v_is_authorized := true;
  else
    select exists (
      select 1 from public.candidate_documents cd
      join public.students s on s.id = cd.student_id
      left join public.enrollments e on e.student_id = s.id
      where cd.id = p_document_id
        and (
          s.owner_id in (select user_id from public.visible_user_ids())
          or e.admission_staff_id in (select user_id from public.visible_user_ids())
        )
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: candidate outside visible scope';
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

-- Update RLS on candidate_documents (remove uploaded_by exception so transferred candidates are strictly protected)
drop policy if exists "Staff can view candidate documents" on public.candidate_documents;
create policy "Staff can view candidate documents" on public.candidate_documents
for select using (
  is_super_admin()
  or is_owner()
  or exists (
    select 1 from public.students s
    left join public.enrollments e on e.student_id = s.id
    where s.id = candidate_documents.student_id
      and (
        s.owner_id in (select user_id from public.visible_user_ids())
        or e.admission_staff_id in (select user_id from public.visible_user_ids())
      )
  )
);

-- Update RLS on document_upload_links to match
drop policy if exists "Staff can view upload links" on public.document_upload_links;
create policy "Staff can view upload links" on public.document_upload_links
for select using (
  is_super_admin()
  or is_owner()
  or exists (
    select 1 from public.students s
    left join public.enrollments e on e.student_id = s.id
    where s.id = document_upload_links.student_id
      and (
        s.owner_id in (select user_id from public.visible_user_ids())
        or e.admission_staff_id in (select user_id from public.visible_user_ids())
      )
  )
);

-- ------------------------------------------------------------------------------
-- 3. ATTENDANCE PUNCH DELETE PROTECTION & TEST CLEANUP
-- ------------------------------------------------------------------------------

-- Allow punch deletion ONLY under explicit test cleanup session flag by superuser/service_role
create or replace function public.trg_prevent_attendance_punch_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  if current_setting('app.allow_test_data_cleanup', true) = 'true'
     and current_user in ('postgres', 'service_role') then
    return old;
  end if;
  raise exception 'Attendance punches are immutable and cannot be deleted.';
end;
$$;

-- Dedicated test attendance cleanup RPC
create or replace function public.cleanup_test_attendance_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not (public.is_super_admin() or auth.jwt()->>'role' = 'service_role' or current_user in ('postgres', 'service_role')) then
    raise exception 'forbidden: unauthorized';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null or not v_email like '%@test.edubridge.local' then
    raise exception 'forbidden: can only cleanup test users';
  end if;

  set local app.allow_test_data_cleanup = 'true';
  delete from public.attendance_punches where user_id = p_user_id;
  delete from public.attendance_days where user_id = p_user_id;
  delete from public.leave_requests where user_id = p_user_id;
  delete from public.regularization_requests where user_id = p_user_id;
  delete from public.staff_attendance_settings where user_id = p_user_id;
end;
$$;

revoke all on function public.cleanup_test_attendance_user(uuid) from public, anon;
grant execute on function public.cleanup_test_attendance_user(uuid) to authenticated, service_role;
