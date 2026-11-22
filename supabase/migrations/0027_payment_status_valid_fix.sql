-- ============================================================================
-- Migration: 0027_payment_status_valid_fix.sql
-- Description: Fix payment_status check in validate_enrollment,
-- update_enrollment_opening_paid, update_enrollment_fee, and dashboard_kpis
-- from 'completed' to 'valid'.
-- ============================================================================

-- 1. validate_enrollment trigger function
create or replace function public.validate_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_payment_count int;
  v_total_paid numeric(12,2);
  v_is_admin boolean;
begin
  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id then
      raise exception 'student_id cannot be changed';
    end if;

    select count(*), coalesce(sum(amount), 0)
    into v_payment_count, v_total_paid
    from public.payments
    where enrollment_id = old.id
      and status = 'valid';

    if v_payment_count > 0 and (new.university_id is distinct from old.university_id or new.course_id is distinct from old.course_id) then
      raise exception 'Cannot change university or course after payments have been recorded';
    end if;

    if (new.total_fee - new.discount) < v_total_paid then
      raise exception 'Net fee (AED %) cannot be reduced below total already paid (AED %)',
        (new.total_fee - new.discount), v_total_paid;
    end if;

    -- Opening paid restriction: once payments exist, only admin or above can modify opening_paid
    if (new.opening_paid is distinct from old.opening_paid) and v_payment_count > 0 then
      select public.is_admin_or_above() into v_is_admin;
      if not coalesce(v_is_admin, false) then
        raise exception 'forbidden: only admin or super_admin can change opening paid after payments exist';
      end if;
    end if;

    new.updated_at = now();
  else
    -- On INSERT: verify net fee >= opening_paid
    if (new.total_fee - new.discount) < coalesce(new.opening_paid, 0) then
      raise exception 'Net fee (AED %) cannot be less than opening paid (AED %)',
        (new.total_fee - new.discount), coalesce(new.opening_paid, 0);
    end if;
  end if;

  return new;
end;
$$;

-- 2. update_enrollment_opening_paid
create or replace function public.update_enrollment_opening_paid(
  p_enrollment_id uuid,
  p_opening_paid numeric,
  p_opening_paid_note text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_admission_staff_id uuid;
  v_old_opening_paid numeric(12,2);
  v_old_note text;
  v_payment_count int;
  v_total_paid numeric(12,2);
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  select admission_staff_id, opening_paid, opening_paid_note
  into v_admission_staff_id, v_old_opening_paid, v_old_note
  from public.enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  if v_caller_role in ('super_admin', 'owner') then
    -- allowed
  elsif v_caller_role = 'admin' then
    if not (v_admission_staff_id in (select * from public.visible_user_ids())) then
      raise exception 'Admins can only edit opening balance for candidates within their scope.';
    end if;
  else
    raise exception 'forbidden: only Super Admins and authorized Admins can edit opening balance';
  end if;

  if p_opening_paid is null or p_opening_paid < 0 then
    raise exception 'Opening paid must be greater than or equal to 0';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_payment_count, v_total_paid
  from public.payments
  where enrollment_id = p_enrollment_id
    and status = 'valid';

  if v_payment_count > 0 and (p_reason is null or trim(p_reason) = '') then
    raise exception 'A reason is required to modify opening paid when payments already exist';
  end if;

  update public.enrollments
  set
    opening_paid = p_opening_paid,
    opening_paid_note = nullif(trim(p_opening_paid_note), ''),
    updated_at = now()
  where id = p_enrollment_id;

  insert into public.audit_log (
    action,
    table_name,
    record_id,
    user_id,
    details
  ) values (
    'update_opening_paid',
    'enrollments',
    p_enrollment_id,
    v_uid,
    jsonb_build_object(
      'old_opening_paid', v_old_opening_paid,
      'new_opening_paid', p_opening_paid,
      'old_note', v_old_note,
      'new_note', trim(p_opening_paid_note),
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'success', true,
    'enrollment_id', p_enrollment_id,
    'opening_paid', p_opening_paid
  );
end;
$$;

-- 3. update_enrollment_fee
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
  v_caller_role text;
  v_admission_staff_id uuid;
  v_old_fee numeric(12,2);
  v_old_discount numeric(12,2);
  v_payment_count int;
  v_total_paid numeric(12,2);
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  select admission_staff_id, total_fee, discount
  into v_admission_staff_id, v_old_fee, v_old_discount
  from public.enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  if v_caller_role in ('super_admin', 'owner') then
    -- allowed
  elsif v_caller_role = 'admin' then
    if not (v_admission_staff_id in (select * from public.visible_user_ids())) then
      raise exception 'Admins can only edit fees for candidates within their scope.';
    end if;
  else
    raise exception 'forbidden: only Super Admins and authorized Admins can edit enrollment fees';
  end if;

  if p_total_fee is null or p_total_fee < 0 then
    raise exception 'Total fee must be >= 0';
  end if;

  if p_discount is null or p_discount < 0 or p_discount > p_total_fee then
    raise exception 'Discount must be between 0 and total fee';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_payment_count, v_total_paid
  from public.payments
  where enrollment_id = p_enrollment_id
    and status = 'valid';

  if v_payment_count > 0 and (p_reason is null or trim(p_reason) = '') then
    raise exception 'A reason is required to modify fees when payments already exist';
  end if;

  if (p_total_fee - p_discount) < v_total_paid then
    raise exception 'Net fee cannot be reduced below total already paid (AED %)', v_total_paid;
  end if;

  update public.enrollments
  set
    total_fee = p_total_fee,
    discount = p_discount,
    updated_at = now()
  where id = p_enrollment_id;

  insert into public.audit_log (
    action,
    table_name,
    record_id,
    user_id,
    details
  ) values (
    'update_enrollment_fee',
    'enrollments',
    p_enrollment_id,
    v_uid,
    jsonb_build_object(
      'old_fee', v_old_fee,
      'new_fee', p_total_fee,
      'old_discount', v_old_discount,
      'new_discount', p_discount,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'success', true,
    'enrollment_id', p_enrollment_id,
    'total_fee', p_total_fee,
    'discount', p_discount
  );
end;
$$;

-- 4. dashboard_kpis
create or replace function public.dashboard_kpis()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_result jsonb;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  if v_caller_role in ('super_admin', 'owner') then
    select jsonb_build_object(
      'total_collected', coalesce((select sum(amount) from public.payments where status = 'valid'), 0),
      'outstanding_balance', coalesce((select sum(balance) from public.enrollment_ledger), 0),
      'active_candidates', coalesce((select count(distinct student_id) from public.enrollments where is_active = true), 0),
      'void_count', coalesce((select count(*) from public.payments where status = 'void'), 0)
    ) into v_result;
  elsif v_caller_role = 'admin' then
    select jsonb_build_object(
      'total_collected', coalesce((
        select sum(p.amount)
        from public.payments p
        join public.enrollments e on e.id = p.enrollment_id
        where p.status = 'valid'
          and e.admission_staff_id in (select * from public.visible_user_ids())
      ), 0),
      'outstanding_balance', coalesce((
        select sum(l.balance)
        from public.enrollment_ledger l
        join public.enrollments e on e.id = l.enrollment_id
        where e.admission_staff_id in (select * from public.visible_user_ids())
      ), 0),
      'active_candidates', coalesce((
        select count(distinct e.student_id)
        from public.enrollments e
        where e.is_active = true
          and e.admission_staff_id in (select * from public.visible_user_ids())
      ), 0),
      'void_count', coalesce((
        select count(*)
        from public.payments p
        join public.enrollments e on e.id = p.enrollment_id
        where p.status = 'void'
          and e.admission_staff_id in (select * from public.visible_user_ids())
      ), 0)
    ) into v_result;
  else
    select jsonb_build_object(
      'total_collected', coalesce((
        select sum(amount)
        from public.payments
        where created_by = v_uid and status = 'valid'
      ), 0),
      'outstanding_balance', coalesce((
        select sum(l.balance)
        from public.enrollment_ledger l
        join public.enrollments e on e.id = l.enrollment_id
        where e.admission_staff_id = v_uid
      ), 0),
      'active_candidates', coalesce((
        select count(distinct e.student_id)
        from public.enrollments e
        where e.is_active = true and e.admission_staff_id = v_uid
      ), 0),
      'void_count', 0
    ) into v_result;
  end if;

  return v_result;
end;
$$;
