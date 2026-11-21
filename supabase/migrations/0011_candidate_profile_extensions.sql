-- =============================================================================
-- Migration: 0011_candidate_profile_extensions.sql
-- 1. Guardian details on students
-- 2. student_addresses table with RLS mirroring students
-- 3. opening_paid and opening_paid_note on enrollments
-- 4. Update enrollment_ledger view to compute total_paid and balance with opening_paid
-- 5. Update validate_enrollment trigger with fee-floor & opening_paid owner restrictions
-- 6. update_enrollment_opening_paid RPC with audit logging
-- 7. Update record_payment RPC to account for opening_paid in current balance
-- 8. Update create_student_with_enrollment RPC with guardian, addresses & opening_paid
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend students with Guardian fields
-- -----------------------------------------------------------------------------
alter table public.students
  add column if not exists guardian_name text,
  add column if not exists guardian_relation text check (guardian_relation in ('father','mother','guardian','spouse','other')),
  add column if not exists guardian_phone text,
  add column if not exists guardian_whatsapp text,
  add column if not exists guardian_email text;

-- -----------------------------------------------------------------------------
-- 2. Table: student_addresses
-- -----------------------------------------------------------------------------
create table if not exists public.student_addresses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  type text not null check (type in ('billing','shipping')),
  contact_name text,
  contact_phone text,
  line1 text not null,
  line2 text,
  city text not null,
  state text,
  postal_code text,
  country text not null default 'United Arab Emirates',
  is_default boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique index: only one default address per type per student
create unique index if not exists idx_student_addresses_default
  on public.student_addresses (student_id, type)
  where is_default = true;

create index if not exists idx_student_addresses_student_id
  on public.student_addresses(student_id);

-- RLS for student_addresses
alter table public.student_addresses enable row level security;

drop policy if exists "student_addresses_select" on public.student_addresses;
create policy "student_addresses_select"
  on public.student_addresses for select
  to authenticated
  using (public.is_active_user());

drop policy if exists "student_addresses_insert" on public.student_addresses;
create policy "student_addresses_insert"
  on public.student_addresses for insert
  to authenticated
  with check (public.is_active_user() and created_by = auth.uid());

drop policy if exists "student_addresses_update" on public.student_addresses;
create policy "student_addresses_update"
  on public.student_addresses for update
  to authenticated
  using (
    public.is_owner() or exists (
      select 1 from public.students s
      where s.id = student_addresses.student_id and s.created_by = auth.uid()
    )
  )
  with check (
    public.is_owner() or exists (
      select 1 from public.students s
      where s.id = student_addresses.student_id and s.created_by = auth.uid()
    )
  );

-- No delete policy on student_addresses (consistent with students)
grant select, insert, update on public.student_addresses to authenticated;
revoke all on public.student_addresses from public, anon;

-- -----------------------------------------------------------------------------
-- 3. Extend enrollments with Opening Balance
-- -----------------------------------------------------------------------------
alter table public.enrollments
  add column if not exists opening_paid numeric(12,2) not null default 0 check (opening_paid >= 0),
  add column if not exists opening_paid_note text;

-- -----------------------------------------------------------------------------
-- 4. Update enrollment_ledger view (security_invoker = true)
-- -----------------------------------------------------------------------------
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
  (coalesce(e.opening_paid, 0) + coalesce(sum(p.amount) filter (where p.status = 'valid'), 0))::numeric(12,2) as total_paid,
  (
    case
      when e.vat_type = 'exclusive' then ((e.total_fee - e.discount) + round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2))
      else (e.total_fee - e.discount)
    end
    - (coalesce(e.opening_paid, 0) + coalesce(sum(p.amount) filter (where p.status = 'valid'), 0))
  )::numeric(12,2) as balance,
  e.opening_paid,
  e.opening_paid_note,
  max(p.paid_at) filter (where p.status = 'valid') as last_payment_at,
  count(p.id) filter (where p.status = 'valid')::int as payment_count
from public.enrollments e
left join public.payments p on p.enrollment_id = e.id
group by e.id, e.student_id, e.total_fee, e.discount, e.vat_type, e.vat_rate, e.opening_paid, e.opening_paid_note;

-- Recreate student_directory_view with security_invoker = true
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

-- -----------------------------------------------------------------------------
-- 5. Update validate_enrollment trigger with fee-floor & opening_paid guard
-- -----------------------------------------------------------------------------
create or replace function public.validate_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_course_uni uuid;
  v_spec_course uuid;
  v_total_paid numeric(12,2);
  v_payment_count int;
  v_payments_sum numeric(12,2);
  v_is_owner boolean;
begin
  -- Validate course belongs to university
  select university_id into v_course_uni from public.courses where id = new.course_id;
  if v_course_uni != new.university_id then
    raise exception 'Selected course does not belong to the selected university';
  end if;

  -- Validate specialization belongs to course if provided
  if new.specialization_id is not null then
    select course_id into v_spec_course from public.specializations where id = new.specialization_id;
    if v_spec_course != new.course_id then
      raise exception 'Selected specialization does not belong to the selected course';
    end if;
  end if;

  -- Calculate existing payments
  if tg_op = 'UPDATE' then
    select count(*), coalesce(sum(amount), 0)
    into v_payment_count, v_payments_sum
    from public.payments
    where enrollment_id = new.id and status = 'valid';

    v_total_paid := coalesce(new.opening_paid, 0) + v_payments_sum;

    -- Fee floor check: net fee cannot be lower than total paid (including opening_paid)
    if (new.total_fee - new.discount) < v_total_paid then
      raise exception 'Net fee (AED %) cannot be reduced below total already paid (AED %)',
        (new.total_fee - new.discount), v_total_paid;
    end if;

    -- Opening paid restriction: once payments exist, only owner can modify opening_paid
    if (new.opening_paid is distinct from old.opening_paid) and v_payment_count > 0 then
      select (role = 'owner') into v_is_owner
      from public.profiles
      where id = auth.uid() and is_active = true;

      if v_is_owner is not true then
        raise exception 'forbidden: only owner can change opening paid after payments exist';
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

revoke execute on function public.validate_enrollment() from public, anon;
grant execute on function public.validate_enrollment() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: update_enrollment_opening_paid (Owner Only with Audit Log)
-- -----------------------------------------------------------------------------
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
  v_is_owner boolean;
  v_old_opening_paid numeric(12,2);
  v_old_note text;
  v_payment_count int;
  v_total_paid numeric(12,2);
begin
  select (role = 'owner') into v_is_owner
  from public.profiles where id = v_uid and is_active = true;

  if v_is_owner is not true then
    raise exception 'forbidden: only owner can edit opening balance';
  end if;

  if p_opening_paid is null or p_opening_paid < 0 then
    raise exception 'Opening paid must be greater than or equal to 0';
  end if;

  select opening_paid, opening_paid_note into v_old_opening_paid, v_old_note
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
    raise exception 'A reason is required to modify opening paid for an enrollment with existing payments';
  end if;

  update public.enrollments
  set
    opening_paid = p_opening_paid,
    opening_paid_note = nullif(trim(p_opening_paid_note), ''),
    updated_at = now()
  where id = p_enrollment_id;

  -- Record in audit_log
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
    'update_opening_paid',
    v_uid,
    jsonb_build_object(
      'old_opening_paid', v_old_opening_paid,
      'new_opening_paid', p_opening_paid,
      'old_note', v_old_note,
      'new_note', nullif(trim(p_opening_paid_note), ''),
      'payments_count', v_payment_count,
      'valid_payments_sum', v_total_paid,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object('success', true, 'enrollment_id', p_enrollment_id);
end;
$$;

revoke execute on function public.update_enrollment_opening_paid(uuid, numeric, text, text) from public, anon;
grant execute on function public.update_enrollment_opening_paid(uuid, numeric, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Update record_payment RPC to account for opening_paid
-- -----------------------------------------------------------------------------
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

  -- Compute current balance from total payable (includes opening_paid + valid payments)
  select (coalesce(v_enrollment.opening_paid, 0) + coalesce(sum(amount), 0))::numeric(12,2)
  into v_paid_before
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

  -- VAT Calculation based on enrollment vat_type & settings
  select coalesce(vat_enabled, false), coalesce(vat_rate, 5.00)
  into v_vat_enabled, v_vat_rate
  from public.company_settings
  limit 1;

  if v_vat_enabled and v_enrollment.vat_type in ('inclusive', 'exclusive') then
    -- 5% inclusive calculation on payment receipt: vat = amount * 5 / 105
    v_vat_amount := round(p_amount * v_vat_rate / (100.00 + v_vat_rate), 2);
  else
    v_vat_amount := 0.00;
  end if;

  -- Atomic sequential receipt number generation for current calendar year
  v_year := extract(year from (p_paid_at at time zone 'Asia/Dubai'))::int;
  v_prefix := 'EB-' || v_year || '-';

  insert into public.receipt_counters as rc (year, last_number)
  values (v_year, 1)
  on conflict (year)
  do update set last_number = rc.last_number + 1
  returning last_number into v_last_no;

  v_receipt_no := v_prefix || lpad(v_last_no::text, 4, '0');

  -- Payee name fallback
  v_payee := nullif(trim(p_payee_name), '');
  if v_payee is null then
    v_payee := v_student.full_name;
  end if;

  -- Insert payment record with immutable financial snapshots
  insert into public.payments (
    receipt_no,
    enrollment_id,
    amount,
    mode,
    reference_no,
    purpose,
    purpose_note,
    paid_at,
    payee_name,
    comments,
    status,
    fee_snapshot,
    paid_before_snapshot,
    balance_after_snapshot,
    received_by,
    vat_rate,
    vat_amount,
    vat_type,
    idempotency_key
  )
  values (
    v_receipt_no,
    p_enrollment_id,
    p_amount,
    p_mode,
    nullif(trim(p_reference_no), ''),
    p_purpose,
    nullif(trim(p_purpose_note), ''),
    p_paid_at,
    v_payee,
    nullif(trim(p_comments), ''),
    'valid',
    v_total_payable,
    v_paid_before,
    v_balance_after,
    v_caller_id,
    v_vat_rate,
    v_vat_amount,
    v_enrollment.vat_type,
    p_idempotency_key
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, payment_mode, payment_purpose, text, text, timestamptz, text, text, uuid) from public, anon;
grant execute on function public.record_payment(uuid, numeric, payment_mode, payment_purpose, text, text, timestamptz, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Update create_student_with_enrollment RPC (guardian, addresses & opening_paid)
-- -----------------------------------------------------------------------------
drop function if exists public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric);

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
  p_vat_rate numeric default 5.00,
  p_guardian_name text default null,
  p_guardian_relation text default null,
  p_guardian_phone text default null,
  p_guardian_whatsapp text default null,
  p_guardian_email text default null,
  p_opening_paid numeric default 0,
  p_opening_paid_note text default null,
  p_billing_address jsonb default null,
  p_shipping_address jsonb default null
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
  v_opening_paid numeric := coalesce(p_opening_paid, 0);
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

  -- Validate guardian relation if provided
  if p_guardian_relation is not null and trim(p_guardian_relation) != '' then
    if trim(p_guardian_relation) not in ('father','mother','guardian','spouse','other') then
      raise exception 'Invalid guardian relation: %', p_guardian_relation;
    end if;
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

  if v_opening_paid < 0 then
    raise exception 'Opening paid must be greater than or equal to 0';
  end if;

  if (p_total_fee - coalesce(p_discount, 0)) < v_opening_paid then
    raise exception 'Net fee (AED %) cannot be less than opening paid (AED %)',
      (p_total_fee - coalesce(p_discount, 0)), v_opening_paid;
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
    guardian_name,
    guardian_relation,
    guardian_phone,
    guardian_whatsapp,
    guardian_email,
    created_by
  )
  values (
    trim(p_full_name),
    v_clean_mobile,
    v_clean_whatsapp,
    nullif(trim(p_email), ''),
    nullif(trim(p_notes), ''),
    nullif(trim(p_guardian_name), ''),
    nullif(trim(p_guardian_relation), ''),
    nullif(trim(p_guardian_phone), ''),
    nullif(trim(p_guardian_whatsapp), ''),
    nullif(trim(p_guardian_email), ''),
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
    opening_paid,
    opening_paid_note,
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
    v_opening_paid,
    nullif(trim(p_opening_paid_note), ''),
    v_uid
  )
  returning id into v_enrollment_id;

  -- Insert Billing address if provided
  if p_billing_address is not null and (p_billing_address->>'line1') is not null then
    insert into public.student_addresses (
      student_id,
      type,
      contact_name,
      contact_phone,
      line1,
      line2,
      city,
      state,
      postal_code,
      country,
      is_default,
      created_by
    )
    values (
      v_student_id,
      'billing',
      nullif(trim(p_billing_address->>'contact_name'), ''),
      nullif(trim(p_billing_address->>'contact_phone'), ''),
      trim(p_billing_address->>'line1'),
      nullif(trim(p_billing_address->>'line2'), ''),
      trim(coalesce(p_billing_address->>'city', 'Dubai')),
      nullif(trim(p_billing_address->>'state'), ''),
      nullif(trim(p_billing_address->>'postal_code'), ''),
      coalesce(nullif(trim(p_billing_address->>'country'), ''), 'United Arab Emirates'),
      true,
      v_uid
    );
  end if;

  -- Insert Shipping address if provided
  if p_shipping_address is not null and (p_shipping_address->>'line1') is not null then
    insert into public.student_addresses (
      student_id,
      type,
      contact_name,
      contact_phone,
      line1,
      line2,
      city,
      state,
      postal_code,
      country,
      is_default,
      created_by
    )
    values (
      v_student_id,
      'shipping',
      nullif(trim(p_shipping_address->>'contact_name'), ''),
      nullif(trim(p_shipping_address->>'contact_phone'), ''),
      trim(p_shipping_address->>'line1'),
      nullif(trim(p_shipping_address->>'line2'), ''),
      trim(coalesce(p_shipping_address->>'city', 'Dubai')),
      nullif(trim(p_shipping_address->>'state'), ''),
      nullif(trim(p_shipping_address->>'postal_code'), ''),
      coalesce(nullif(trim(p_shipping_address->>'country'), ''), 'United Arab Emirates'),
      true,
      v_uid
    );
  end if;

  return jsonb_build_object(
    'student_id', v_student_id,
    'student_code', v_student_code,
    'enrollment_id', v_enrollment_id
  );
end;
$$;

revoke execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, text, text, text, text, numeric, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, text, text, text, text, numeric, text, jsonb, jsonb) to authenticated;
