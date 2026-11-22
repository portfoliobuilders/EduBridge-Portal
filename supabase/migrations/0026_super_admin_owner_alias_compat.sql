-- ============================================================================
-- Migration: 0026_super_admin_owner_alias_compat.sql
-- Description: Ensure backward-compatibility where 'owner' acts as alias to 'super_admin'
-- in is_super_admin(), is_admin_or_above(), triggers, and scoped RPCs.
-- ============================================================================

-- 1. Helper functions
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role in ('super_admin', 'owner')
  );
$$;

create or replace function public.is_admin_or_above()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role in ('super_admin', 'owner', 'admin')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select public.is_super_admin();
$$;

-- 2. Update visible_user_ids()
create or replace function public.visible_user_ids()
returns table(user_id uuid)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_admin_scope text;
begin
  if v_uid is null then
    return;
  end if;

  select role::text, coalesce(admin_scope, 'team')
  into v_role, v_admin_scope
  from public.profiles
  where id = v_uid and is_active = true;

  if v_role in ('super_admin', 'owner') or (v_role = 'admin' and v_admin_scope = 'company') then
    return query
    select id from public.profiles;
  elsif v_role = 'admin' then
    return query
    select user_id from public.team_member_ids(v_uid);
  else
    return query
    select v_uid;
  end if;
end;
$$;

-- 3. Update void_payment RPC
create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
)
returns public.payments
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_admin_can_void boolean := false;
  v_payment public.payments;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  select coalesce(admins_can_void, false) into v_admin_can_void
  from public.company_settings limit 1;

  if v_caller_role in ('super_admin', 'owner') then
    -- Super Admin can always void
  elsif v_caller_role = 'admin' and v_admin_can_void then
    -- Admin allowed if setting enabled
  else
    raise exception 'forbidden: only Super Admins and authorized Admins can void receipts';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Void reason is mandatory';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status = 'void' then
    raise exception 'Payment is already voided';
  end if;

  update public.payments
  set
    status = 'void',
    voided_at = now(),
    voided_by = v_uid,
    void_reason = trim(p_reason)
  where id = p_payment_id
  returning * into v_payment;

  insert into public.audit_log (
    action,
    table_name,
    record_id,
    user_id,
    details
  ) values (
    'void_payment',
    'payments',
    p_payment_id,
    v_uid,
    jsonb_build_object(
      'receipt_no', v_payment.receipt_no,
      'amount', v_payment.amount,
      'enrollment_id', v_payment.enrollment_id,
      'reason', trim(p_reason)
    )
  );

  return v_payment;
end;
$$;

-- 4. Update update_enrollment_opening_paid RPC
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
    and status = 'completed';

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

-- 5. Update update_enrollment_fee RPC
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
    and status = 'completed';

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

-- 6. Update dashboard & report RPCs to accept super_admin and owner
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
      'total_collected', coalesce((select sum(amount) from public.payments where status = 'completed'), 0),
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
        where p.status = 'completed'
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
        where created_by = v_uid and status = 'completed'
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
