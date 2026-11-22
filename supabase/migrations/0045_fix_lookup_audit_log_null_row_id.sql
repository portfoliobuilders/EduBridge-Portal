-- ==============================================================================
-- Migration: 0045_fix_lookup_audit_log_null_row_id.sql
-- Description:
--   Ensure row_id is not null when candidate lookup does not find a match.
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

  -- Log every lookup attempt in audit_log using actual schema (fallback nil UUID if unmatched)
  insert into public.audit_log (
    table_name,
    row_id,
    action,
    actor,
    at,
    diff
  ) values (
    'students',
    coalesce(v_student.id, '00000000-0000-0000-0000-000000000000'::uuid),
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
