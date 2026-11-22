-- ==============================================================================
-- Migration: 0044_fix_lookup_and_transfer_audit_log.sql
-- Description:
--   Fix audit_log insert schema in lookup_candidate_for_payment and
--   transfer_candidate (use table_name, row_id, action, actor, at, diff).
-- ==============================================================================

create or replace function public.lookup_candidate_for_payment(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_clean_query text := trim(p_query);
  v_digits text;
  v_student record;
  v_enrollments jsonb;
  v_masked_mobile text;
  v_is_own boolean;
  v_owner_name text;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if v_clean_query is null or length(v_clean_query) < 3 then
    return null;
  end if;

  v_digits := regexp_replace(v_clean_query, '\D', '', 'g');

  -- EXACT match on student code OR exact normalized mobile
  select s.* into v_student
  from public.students s
  where s.is_active = true
    and (
      upper(s.student_code) = upper(v_clean_query)
      or (
        length(v_digits) >= 9
        and regexp_replace(s.mobile, '\D', '', 'g') in (
          v_digits,
          case when v_digits like '971%' then substring(v_digits from 4) else '971' || v_digits end,
          case when v_digits like '0%' then substring(v_digits from 2) else '0' || v_digits end,
          case when v_digits like '0%' then '971' || substring(v_digits from 2) else v_digits end
        )
      )
    )
  limit 1;

  -- Log every lookup attempt in audit_log using actual schema
  insert into public.audit_log (
    table_name,
    row_id,
    action,
    actor,
    at,
    diff
  ) values (
    'students',
    v_student.id,
    'lookup_candidate_for_payment',
    v_caller_id,
    clock_timestamp(),
    jsonb_build_object(
      'query', p_query,
      'matched', (v_student.id is not null)
    )
  );

  if v_student.id is null then
    return null;
  end if;

  -- Mask mobile: show country code and last 2 digits, mask middle
  if length(v_student.mobile) > 4 then
    v_masked_mobile := substring(v_student.mobile from 1 for 5) || ' ••• ••' || right(v_student.mobile, 2);
  else
    v_masked_mobile := '••••••••';
  end if;

  -- Determine if caller is owner or has active enrollment
  v_is_own := (
    v_student.owner_id = v_caller_id
    or exists (
      select 1 from public.enrollments e
      where e.student_id = v_student.id and e.admission_staff_id = v_caller_id
    )
  );

  select coalesce(p.display_name, p.full_name) into v_owner_name
  from public.profiles p where p.id = v_student.owner_id;

  -- Gather active enrollments with balance
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'enrollment_id', e.id,
      'program_name', coalesce(u.name || ' – ' || c.name, 'Program'),
      'admission_staff_id', e.admission_staff_id,
      'admission_staff_name', coalesce(p_adm.display_name, p_adm.full_name),
      'total_payable', el.total_payable,
      'total_paid', el.total_paid,
      'balance', el.balance,
      'status', e.status
    )
  ), '[]'::jsonb)
  into v_enrollments
  from public.enrollments e
  join public.enrollment_ledger el on el.enrollment_id = e.id
  left join public.universities u on u.id = e.university_id
  left join public.courses c on c.id = e.course_id
  left join public.profiles p_adm on p_adm.id = e.admission_staff_id
  where e.student_id = v_student.id and e.status = 'active';

  return jsonb_build_object(
    'student_id', v_student.id,
    'student_code', v_student.student_code,
    'student_name', v_student.full_name,
    'masked_mobile', v_masked_mobile,
    'owner_id', v_student.owner_id,
    'owner_name', v_owner_name,
    'is_own', v_is_own,
    'enrollments', v_enrollments
  );
end;
$$;

revoke all on function public.lookup_candidate_for_payment(text) from public, anon;
grant execute on function public.lookup_candidate_for_payment(text) to authenticated;

create or replace function public.transfer_candidate(
  p_student_id uuid,
  p_to_user uuid,
  p_scope text default 'candidate',
  p_reason text default null,
  p_enrollment_id uuid default null
)
returns public.candidate_transfers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_name text;
  v_student record;
  v_target_profile record;
  v_from_user uuid;
  v_transfer public.candidate_transfers;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text, coalesce(display_name, full_name) into v_caller_role, v_caller_name
  from public.profiles where id = v_caller_id and is_active = true;

  if v_caller_role not in ('super_admin', 'owner', 'admin') then
    raise exception 'forbidden: only administrators can transfer candidates';
  end if;

  select * into v_student from public.students where id = p_student_id and is_active = true;
  if not found then
    raise exception 'Candidate not found';
  end if;

  select * into v_target_profile from public.profiles where id = p_to_user and is_active = true;
  if not found then
    raise exception 'Target staff member not found or inactive';
  end if;

  -- Admin can only transfer within their visible_user_ids()
  if v_caller_role = 'admin' then
    if not (p_to_user in (select user_id from public.visible_user_ids())) then
      raise exception 'forbidden: target staff member outside your admin scope';
    end if;
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'A mandatory transfer reason (min 5 characters) is required';
  end if;

  if p_scope = 'candidate' then
    v_from_user := v_student.owner_id;
    update public.students
    set owner_id = p_to_user, updated_at = now()
    where id = p_student_id;
  else
    if p_enrollment_id is null then
      raise exception 'enrollment_id is required for enrollment transfer';
    end if;
    select admission_staff_id into v_from_user from public.enrollments where id = p_enrollment_id;
    update public.enrollments
    set admission_staff_id = p_to_user, updated_at = now()
    where id = p_enrollment_id;
  end if;

  -- Log in candidate_transfers
  insert into public.candidate_transfers (
    student_id,
    enrollment_id,
    from_user,
    to_user,
    reason,
    transferred_by
  )
  values (
    p_student_id,
    p_enrollment_id,
    v_from_user,
    p_to_user,
    trim(p_reason),
    v_caller_id
  )
  returning * into v_transfer;

  -- Log in audit_log
  insert into public.audit_log (
    table_name,
    row_id,
    action,
    actor,
    at,
    diff
  ) values (
    'students',
    p_student_id,
    'transfer_candidate',
    v_caller_id,
    clock_timestamp(),
    jsonb_build_object(
      'from_user', v_from_user,
      'to_user', p_to_user,
      'scope', p_scope,
      'reason', trim(p_reason)
    )
  );

  return v_transfer;
end;
$$;

revoke all on function public.transfer_candidate(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.transfer_candidate(uuid, uuid, text, text, uuid) to authenticated;
