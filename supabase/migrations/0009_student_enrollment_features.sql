-- =============================================================================
-- Migration: 0009_student_enrollment_features.sql
-- Description: RPCs for atomic student+enrollment creation, add enrollment,
--              owner fee updates with audit logging, and student directory view.
-- =============================================================================

-- 1. Create student directory view (security_invoker = true)
create or replace view public.student_directory_view
with (security_invoker = true) as
select
  s.id,
  s.student_code,
  s.full_name,
  s.mobile,
  s.whatsapp,
  s.email,
  s.notes,
  s.created_by,
  s.created_at,
  s.updated_at,
  coalesce(sum(el.balance), 0)::numeric(12,2) as total_balance,
  coalesce(sum(el.total_paid), 0)::numeric(12,2) as total_paid,
  coalesce(sum(el.net_fee), 0)::numeric(12,2) as total_net_fee,
  max(el.last_payment_at) as last_payment_at,
  count(distinct e.id)::int as enrollment_count,
  string_agg(distinct u.name, ', ') as university_names,
  string_agg(distinct c.name, ', ') as course_names,
  array_remove(array_agg(distinct e.university_id), null) as university_ids,
  array_remove(array_agg(distinct e.course_id), null) as course_ids
from public.students s
left join public.enrollments e on e.student_id = s.id
left join public.enrollment_ledger el on el.enrollment_id = e.id
left join public.universities u on u.id = e.university_id
left join public.courses c on c.id = e.course_id
where s.is_active = true
group by s.id;

-- 2. Atomic RPC: create_student_with_enrollment
create or replace function public.create_student_with_enrollment(
  p_full_name text,
  p_mobile text,
  p_whatsapp text default null,
  p_email text default null,
  p_notes text default null,
  p_university_id uuid default null,
  p_course_id uuid default null,
  p_specialization_id uuid default null,
  p_total_fee numeric default null,
  p_discount numeric default 0,
  p_intake text default null,
  p_admission_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_active boolean;
  v_is_owner boolean;
  v_student_id uuid;
  v_student_code text;
  v_enrollment_id uuid;
  v_admission_staff_id uuid;
  v_clean_mobile text;
  v_clean_whatsapp text;
begin
  -- Ensure user is authenticated and active
  select is_active, (role = 'owner')
  into v_is_active, v_is_owner
  from public.profiles
  where id = v_uid;

  if v_uid is null or v_is_active is not true then
    raise exception 'Unauthorized: inactive or unauthenticated user';
  end if;

  -- Validate student fields
  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Student full name is required';
  end if;

  v_clean_mobile := trim(p_mobile);
  if v_clean_mobile is null or v_clean_mobile = '' then
    raise exception 'Mobile number is required';
  end if;

  v_clean_whatsapp := trim(p_whatsapp);
  if v_clean_whatsapp is null or v_clean_whatsapp = '' then
    v_clean_whatsapp := v_clean_mobile;
  end if;

  -- Validate enrollment fields
  if p_university_id is null then
    raise exception 'University is required';
  end if;

  if p_course_id is null then
    raise exception 'Course is required';
  end if;

  if p_total_fee is null or p_total_fee < 0 then
    raise exception 'Total fee must be greater than or equal to 0';
  end if;

  if p_discount is null or p_discount < 0 or p_discount > p_total_fee then
    raise exception 'Discount must be between 0 and total fee';
  end if;

  -- Admission staff assignment
  if p_admission_staff_id is not null and p_admission_staff_id != v_uid then
    if not v_is_owner then
      raise exception 'Forbidden: staff can only assign themselves as admission staff';
    end if;
    if not exists (select 1 from public.profiles where id = p_admission_staff_id and is_active = true) then
      raise exception 'Assigned admission staff not found or inactive';
    end if;
    v_admission_staff_id := p_admission_staff_id;
  else
    v_admission_staff_id := v_uid;
  end if;

  -- Insert student (code generation trigger will handle code if null/empty)
  insert into public.students (
    full_name,
    mobile,
    whatsapp,
    email,
    notes,
    created_by
  )
  values (
    trim(p_full_name),
    v_clean_mobile,
    v_clean_whatsapp,
    nullif(trim(p_email), ''),
    nullif(trim(p_notes), ''),
    v_uid
  )
  returning id, student_code into v_student_id, v_student_code;

  -- Insert enrollment (fires trg_validate_enrollment)
  insert into public.enrollments (
    student_id,
    university_id,
    course_id,
    specialization_id,
    admission_staff_id,
    intake,
    total_fee,
    discount,
    created_by
  )
  values (
    v_student_id,
    p_university_id,
    p_course_id,
    p_specialization_id,
    v_admission_staff_id,
    nullif(trim(p_intake), ''),
    p_total_fee,
    coalesce(p_discount, 0),
    v_uid
  )
  returning id into v_enrollment_id;

  return jsonb_build_object(
    'student_id', v_student_id,
    'student_code', v_student_code,
    'enrollment_id', v_enrollment_id
  );
end;
$$;

revoke execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid) to authenticated;

-- 3. RPC: add_student_enrollment
create or replace function public.add_student_enrollment(
  p_student_id uuid,
  p_university_id uuid,
  p_course_id uuid,
  p_specialization_id uuid default null,
  p_total_fee numeric default null,
  p_discount numeric default 0,
  p_intake text default null,
  p_admission_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_active boolean;
  v_is_owner boolean;
  v_admission_staff_id uuid;
  v_enrollment_id uuid;
begin
  select is_active, (role = 'owner')
  into v_is_active, v_is_owner
  from public.profiles
  where id = v_uid;

  if v_uid is null or v_is_active is not true then
    raise exception 'Unauthorized: inactive or unauthenticated user';
  end if;

  if not exists (select 1 from public.students where id = p_student_id and is_active = true) then
    raise exception 'Student not found or inactive';
  end if;

  if p_university_id is null or p_course_id is null or p_total_fee is null or p_total_fee < 0 then
    raise exception 'University, course, and valid total fee are required';
  end if;

  if p_discount is null or p_discount < 0 or p_discount > p_total_fee then
    raise exception 'Discount must be between 0 and total fee';
  end if;

  if p_admission_staff_id is not null and p_admission_staff_id != v_uid then
    if not v_is_owner then
      raise exception 'Forbidden: staff can only assign themselves as admission staff';
    end if;
    if not exists (select 1 from public.profiles where id = p_admission_staff_id and is_active = true) then
      raise exception 'Assigned admission staff not found or inactive';
    end if;
    v_admission_staff_id := p_admission_staff_id;
  else
    v_admission_staff_id := v_uid;
  end if;

  insert into public.enrollments (
    student_id,
    university_id,
    course_id,
    specialization_id,
    admission_staff_id,
    intake,
    total_fee,
    discount,
    created_by
  )
  values (
    p_student_id,
    p_university_id,
    p_course_id,
    p_specialization_id,
    v_admission_staff_id,
    nullif(trim(p_intake), ''),
    p_total_fee,
    coalesce(p_discount, 0),
    v_uid
  )
  returning id into v_enrollment_id;

  return jsonb_build_object('enrollment_id', v_enrollment_id);
end;
$$;

revoke execute on function public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid) to authenticated;

-- 4. RPC: update_enrollment_fee
create or replace function public.update_enrollment_fee(
  p_enrollment_id uuid,
  p_total_fee numeric,
  p_discount numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_old_fee numeric(12,2);
  v_old_discount numeric(12,2);
  v_payment_count int;
  v_total_paid numeric(12,2);
begin
  select (role = 'owner') into v_is_owner
  from public.profiles where id = v_uid and is_active = true;

  if v_is_owner is not true then
    raise exception 'forbidden: only owner can edit enrollment fees';
  end if;

  select total_fee, discount into v_old_fee, v_old_discount
  from public.enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_payment_count, v_total_paid
  from public.payments
  where enrollment_id = p_enrollment_id and status = 'valid';

  if v_payment_count > 0 and (p_reason is null or trim(p_reason) = '') then
    raise exception 'A reason is required to modify fees for an enrollment with existing payments';
  end if;

  -- Update enrollment (trg_validate_enrollment will enforce net_fee >= v_total_paid)
  update public.enrollments
  set
    total_fee = p_total_fee,
    discount = coalesce(p_discount, 0),
    updated_at = now()
  where id = p_enrollment_id;

  -- Record audit log if there are existing payments or if reason provided
  if v_payment_count > 0 or (p_reason is not null and trim(p_reason) != '') then
    insert into public.audit_log (
      table_name,
      row_id,
      action,
      actor,
      diff
    )
    values (
      'enrollments',
      p_enrollment_id,
      'update_fee',
      v_uid,
      jsonb_build_object(
        'old_total_fee', v_old_fee,
        'new_total_fee', p_total_fee,
        'old_discount', v_old_discount,
        'new_discount', coalesce(p_discount, 0),
        'payments_count', v_payment_count,
        'total_paid', v_total_paid,
        'reason', trim(p_reason)
      )
    );
  end if;

  return jsonb_build_object('success', true, 'enrollment_id', p_enrollment_id);
end;
$$;

revoke execute on function public.update_enrollment_fee(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.update_enrollment_fee(uuid, numeric, numeric, text) to authenticated;
