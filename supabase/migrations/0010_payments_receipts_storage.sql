-- =============================================================================
-- Migration: 0010_payments_receipts_storage.sql
-- Description:
--   1. Add VAT mode (inclusive, exclusive, none) to enrollments & payments
--   2. Update enrollment_ledger view to compute total_payable & balance with VAT modes
--   3. Duplicate student guard (same mobile + case-insensitive name) in create_student_with_enrollment
--   4. Idempotent record_payment RPC
--   5. Storage RLS policies for receipts bucket
-- =============================================================================

-- 1. Add VAT configuration columns to enrollments and payments
alter table public.enrollments
  add column if not exists vat_type text not null default 'inclusive' check (vat_type in ('inclusive', 'exclusive', 'none')),
  add column if not exists vat_rate numeric(5,2) not null default 5.00 check (vat_rate >= 0);

alter table public.payments
  add column if not exists vat_type text not null default 'inclusive' check (vat_type in ('inclusive', 'exclusive', 'none')),
  add column if not exists vat_rate numeric(5,2) not null default 5.00 check (vat_rate >= 0);

-- Ensure idempotency key unique constraint exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_idempotency_key_key'
  ) then
    alter table public.payments add constraint payments_idempotency_key_key unique (idempotency_key);
  end if;
end $$;

-- 2. Update view: enrollment_ledger (security_invoker = true)
drop view if exists public.student_directory_view cascade;
drop view if exists public.enrollment_ledger cascade;

create view public.enrollment_ledger
with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.student_id,
  e.total_fee,
  e.discount,
  (e.total_fee - e.discount)::numeric(12,2) as net_fee,
  e.vat_type,
  e.vat_rate,
  case
    when e.vat_type = 'exclusive' then round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2)
    when e.vat_type = 'inclusive' then round((e.total_fee - e.discount) * e.vat_rate / (100.00 + e.vat_rate), 2)
    else 0.00
  end::numeric(12,2) as vat_amount,
  case
    when e.vat_type = 'exclusive' then ((e.total_fee - e.discount) + round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2))
    else (e.total_fee - e.discount)
  end::numeric(12,2) as total_payable,
  coalesce(sum(p.amount) filter (where p.status = 'valid'), 0)::numeric(12,2) as total_paid,
  (
    case
      when e.vat_type = 'exclusive' then ((e.total_fee - e.discount) + round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2))
      else (e.total_fee - e.discount)
    end
    - coalesce(sum(p.amount) filter (where p.status = 'valid'), 0)
  )::numeric(12,2) as balance,
  max(p.paid_at) filter (where p.status = 'valid') as last_payment_at,
  count(p.id) filter (where p.status = 'valid')::int as payment_count
from public.enrollments e
left join public.payments p on p.enrollment_id = e.id
group by e.id, e.student_id, e.total_fee, e.discount, e.vat_type, e.vat_rate;

-- Refresh student_directory_view to ensure security_invoker = true
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
  coalesce(sum(el.total_payable), 0)::numeric(12,2) as total_net_fee,
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

grant select on public.enrollment_ledger to authenticated;
revoke all on public.enrollment_ledger from public, anon;

grant select on public.student_directory_view to authenticated;
revoke all on public.student_directory_view from public, anon;

-- 3. Update create_student_with_enrollment with Duplicate Guard (same mobile AND same case-insensitive name)
drop function if exists public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid);

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
  p_admission_staff_id uuid default null,
  p_vat_type text default 'inclusive',
  p_vat_rate numeric default 5.00
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
  v_existing_code text;
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

  -- Duplicate guard: same mobile AND same full name (case-insensitive)
  select student_code into v_existing_code
  from public.students
  where is_active = true
    and mobile = v_clean_mobile
    and lower(trim(full_name)) = lower(trim(p_full_name))
  limit 1;

  if v_existing_code is not null then
    raise exception 'Student already exists: %', v_existing_code;
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

  -- Validate VAT type
  if p_vat_type not in ('inclusive', 'exclusive', 'none') then
    raise exception 'Invalid VAT type: %', p_vat_type;
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

  -- Insert student (code generation trigger will handle student_code)
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
    vat_type,
    vat_rate,
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
    coalesce(p_vat_type, 'inclusive'),
    coalesce(p_vat_rate, 5.00),
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

revoke execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric) from public, anon;
grant execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric) to authenticated;

-- 4. Update record_payment RPC with idempotent return and VAT handling
create or replace function public.record_payment(
  p_enrollment_id uuid,
  p_amount numeric,
  p_mode payment_mode,
  p_purpose payment_purpose,
  p_purpose_note text,
  p_reference_no text,
  p_paid_at timestamptz,
  p_payee_name text,
  p_comments text,
  p_idempotency_key uuid default null
)
returns payments
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller_id uuid;
  v_enrollment record;
  v_student record;
  v_paid_before numeric(12,2);
  v_total_payable numeric(12,2);
  v_current_balance numeric(12,2);
  v_balance_after numeric(12,2);
  v_year int;
  v_prefix text;
  v_last_no int;
  v_receipt_no text;
  v_vat_enabled boolean;
  v_vat_rate numeric(5,2);
  v_vat_amount numeric(12,2) := 0;
  v_payee text;
  v_payment payments;
  v_now timestamptz := now();
begin
  -- Require active user
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized: caller is not an active profile';
  end if;

  -- Idempotency check: if key already processed, return existing payment row directly
  if p_idempotency_key is not null then
    select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
    if found then
      return v_payment;
    end if;
  end if;

  -- Validate amount
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  -- Validate purpose_note if other
  if p_purpose = 'other' and (p_purpose_note is null or trim(p_purpose_note) = '') then
    raise exception 'Purpose note is required when purpose is other';
  end if;

  -- Validate reference_no for non-cash modes
  if p_mode in ('card', 'link', 'bank_transfer') and (p_reference_no is null or trim(p_reference_no) = '') then
    raise exception 'Reference number is required for % payments', p_mode;
  end if;

  -- Validate paid_at: max 5 mins future drift and max 30 days back
  if p_paid_at > (v_now + interval '5 minutes') then
    raise exception 'Payment date cannot be in the future';
  end if;
  if p_paid_at < (v_now - interval '30 days') then
    raise exception 'Payment date cannot be older than 30 days';
  end if;

  -- Lock enrollment row & verify active status
  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Enrollment not found';
  end if;
  if v_enrollment.status != 'active' then
    raise exception 'Cannot record payment for % enrollment', v_enrollment.status;
  end if;

  -- Student lookup
  select * into v_student from public.students where id = v_enrollment.student_id;

  -- Compute current balance from total payable (supports VAT exclusive / inclusive)
  select coalesce(sum(amount), 0)::numeric(12,2) into v_paid_before
  from public.payments
  where enrollment_id = p_enrollment_id and status = 'valid';

  -- Calculate total payable according to enrollment's vat_type
  if v_enrollment.vat_type = 'exclusive' then
    v_total_payable := (v_enrollment.total_fee - v_enrollment.discount) + round((v_enrollment.total_fee - v_enrollment.discount) * (v_enrollment.vat_rate / 100.00), 2);
  else
    v_total_payable := (v_enrollment.total_fee - v_enrollment.discount);
  end if;

  v_current_balance := v_total_payable - v_paid_before;

  if p_amount > v_current_balance then
    raise exception 'Amount exceeds balance of AED %', trim(to_char(v_current_balance, 'FM999,999,990.00'));
  end if;

  v_balance_after := v_current_balance - p_amount;

  -- Upsert receipt_counters for Dubai year
  v_year := extract(year from (v_now at time zone 'Asia/Dubai'))::int;

  select receipt_prefix, vat_enabled, vat_rate
  into v_prefix, v_vat_enabled, v_vat_rate
  from public.company_settings
  limit 1;

  if v_prefix is null then
    v_prefix := 'EB-RV';
  end if;

  insert into public.receipt_counters (year, last_no)
  values (v_year, 1)
  on conflict (year) do update
  set last_no = receipt_counters.last_no + 1
  returning last_no into v_last_no;

  v_receipt_no := v_prefix || '-' || v_year::text || '-' || lpad(v_last_no::text, 5, '0');

  -- Compute VAT amount according to enrollment settings
  if v_enrollment.vat_type = 'exclusive' then
    v_vat_amount := round((p_amount * v_enrollment.vat_rate) / (100.00 + v_enrollment.vat_rate), 2);
  elsif v_enrollment.vat_type = 'inclusive' then
    v_vat_amount := round((p_amount * v_enrollment.vat_rate) / (100.00 + v_enrollment.vat_rate), 2);
  else
    v_vat_amount := 0;
  end if;

  v_payee := coalesce(nullif(trim(p_payee_name), ''), v_student.full_name);

  -- Insert payment with snapshots
  insert into public.payments (
    receipt_no,
    enrollment_id,
    student_id,
    amount,
    mode,
    purpose,
    purpose_note,
    reference_no,
    paid_at,
    received_by,
    payee_name,
    comments,
    status,
    fee_snapshot,
    paid_before_snapshot,
    balance_after_snapshot,
    vat_amount,
    vat_type,
    vat_rate,
    idempotency_key
  )
  values (
    v_receipt_no,
    p_enrollment_id,
    v_student.id,
    p_amount,
    p_mode,
    p_purpose,
    p_purpose_note,
    p_reference_no,
    p_paid_at,
    v_caller_id,
    v_payee,
    nullif(trim(p_comments), ''),
    'valid',
    v_total_payable,
    v_paid_before,
    v_balance_after,
    v_vat_amount,
    v_enrollment.vat_type,
    v_enrollment.vat_rate,
    p_idempotency_key
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, payment_mode, payment_purpose, text, text, timestamptz, text, text, uuid) from public, anon;
grant execute on function public.record_payment(uuid, numeric, payment_mode, payment_purpose, text, text, timestamptz, text, text, uuid) to authenticated;

-- 5. Storage RLS policies for receipts bucket
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'receipts_insert_active_user'
  ) then
    create policy "receipts_insert_active_user"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'receipts' and public.is_active_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'receipts_update_active_user'
  ) then
    create policy "receipts_update_active_user"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'receipts' and public.is_active_user());
  end if;
end $$;
