-- =============================================================================
-- Migration: 0001_core.sql
-- Description: Core schema, RLS, functions, and audit logging for EduBridge
-- =============================================================================

-- Extensions
create extension if not exists "pg_trgm";
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type app_role as enum ('owner', 'staff');
create type payment_mode as enum ('card', 'cash', 'link', 'bank_transfer');
create type payment_purpose as enum ('admission', 'repayment', 'other');
create type payment_status as enum ('valid', 'void');
create type enrollment_status as enum ('active', 'completed', 'cancelled');
create type share_channel as enum ('whatsapp', 'email', 'web_share', 'sms', 'download', 'print', 'link_copy');

-- -----------------------------------------------------------------------------
-- 2. Profiles (links to auth.users)
-- -----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper auth checks (SECURITY DEFINER to avoid recursion)
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'owner'
      and is_active = true
  );
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- Trigger to create profile when auth.users is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    'staff',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profile update guard: non-owners cannot change role or is_active
create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_owners_count int;
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    if not public.is_owner() then
      raise exception 'Only owners can modify profile roles or active status';
    end if;

    -- Prevent last active owner from demoting or deactivating themselves
    if old.role = 'owner' and (new.role != 'owner' or new.is_active = false) then
      select count(*) into v_active_owners_count
      from profiles
      where role = 'owner' and is_active = true and id != old.id;

      if v_active_owners_count = 0 then
        raise exception 'Cannot deactivate or demote the last remaining active owner';
      end if;
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_guard_profile_updates
  before update on profiles
  for each row execute function public.guard_profile_updates();

-- -----------------------------------------------------------------------------
-- 3. Company Settings (singleton)
-- -----------------------------------------------------------------------------
create table company_settings (
  singleton boolean primary key default true check (singleton),
  id uuid not null default gen_random_uuid(),
  name text not null,
  address text not null,
  phone text not null,
  email text not null,
  website text not null,
  trn text not null,
  logo_path text,
  receipt_prefix text not null default 'EB-RV',
  statement_prefix text not null default 'EB-FS',
  vat_enabled boolean not null default false,
  vat_rate numeric(5,2) not null default 5.00,
  footer_note text default 'Keep your receipt vouchers for future references.',
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Seed company settings default row
insert into company_settings (
  singleton,
  name,
  address,
  phone,
  email,
  website,
  trn,
  receipt_prefix,
  statement_prefix,
  vat_enabled,
  vat_rate,
  footer_note
) values (
  true,
  'EduBridge Education',
  'M03, Royal House Building, Hor Al Anz East, Dubai – UAE',
  '+971 58 107 3898',
  'info@edubridgeeducation.com',
  'https://edubridgeeducation.com',
  '105215478600003',
  'EB-RV',
  'EB-FS',
  false,
  5.00,
  'Keep your receipt vouchers for future references.'
) on conflict (singleton) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Universities, Courses, Specializations
-- -----------------------------------------------------------------------------
create table universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'UAE',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_universities_lower_name on universities(lower(name));

create table courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete restrict,
  name text not null,
  level text not null,
  duration text,
  default_fee numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_courses_uni_lower_name on courses(university_id, lower(name));

create table specializations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete restrict,
  name text not null,
  default_fee numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_specializations_course_lower_name on specializations(course_id, lower(name));

-- -----------------------------------------------------------------------------
-- 5. Student Counters and Students
-- -----------------------------------------------------------------------------
create table student_counters (
  id int primary key default 1 check (id = 1),
  last_no int not null default 0
);
insert into student_counters (id, last_no) values (1, 0) on conflict (id) do nothing;

create table students (
  id uuid primary key default gen_random_uuid(),
  student_code text unique not null,
  full_name text not null,
  mobile text not null,
  whatsapp text,
  email text,
  notes text,
  created_by uuid not null references profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_students_full_name_trgm on students using gin (full_name gin_trgm_ops);
create index idx_students_mobile on students (mobile);
create index idx_students_email on students (email);

-- Trigger to generate sequential student_code
create or replace function public.generate_student_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  if new.student_code is null or new.student_code = '' then
    update student_counters
    set last_no = last_no + 1
    where id = 1
    returning last_no into v_next;

    new.student_code := 'EB-STU-' || lpad(v_next::text, 5, '0');
  end if;

  if new.whatsapp is null or trim(new.whatsapp) = '' then
    new.whatsapp := new.mobile;
  end if;

  return new;
end;
$$;

create trigger trg_students_code_gen
  before insert on students
  for each row execute function public.generate_student_code();

-- -----------------------------------------------------------------------------
-- 6. Enrollments
-- -----------------------------------------------------------------------------
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  university_id uuid not null references universities(id) on delete restrict,
  course_id uuid not null references courses(id) on delete restrict,
  specialization_id uuid references specializations(id) on delete restrict,
  admission_staff_id uuid not null references profiles(id),
  intake text,
  total_fee numeric(12,2) not null check (total_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0 and discount <= total_fee),
  status enrollment_status not null default 'active',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_enrollments_student on enrollments(student_id);
create index idx_enrollments_admission_staff on enrollments(admission_staff_id);

-- Consistency & fee guard triggers for enrollments
create or replace function public.validate_enrollment()
returns trigger
language plpgsql
as $$
declare
  v_course_uni uuid;
  v_spec_course uuid;
  v_total_paid numeric(12,2);
begin
  -- Validate course belongs to university
  select university_id into v_course_uni from courses where id = new.course_id;
  if v_course_uni != new.university_id then
    raise exception 'Selected course does not belong to the selected university';
  end if;

  -- Validate specialization belongs to course if provided
  if new.specialization_id is not null then
    select course_id into v_spec_course from specializations where id = new.specialization_id;
    if v_spec_course != new.course_id then
      raise exception 'Selected specialization does not belong to the selected course';
    end if;
  end if;

  -- If updating, ensure new net_fee >= total valid payments made
  if tg_op = 'UPDATE' then
    select coalesce(sum(amount), 0) into v_total_paid
    from payments
    where enrollment_id = new.id and status = 'valid';

    if (new.total_fee - new.discount) < v_total_paid then
      raise exception 'Net fee (AED %) cannot be reduced below total already paid (AED %)',
        (new.total_fee - new.discount), v_total_paid;
    end if;
    new.updated_at = now();
  end if;

  return new;
end;
$$;

create trigger trg_validate_enrollment
  before insert or update on enrollments
  for each row execute function public.validate_enrollment();

-- -----------------------------------------------------------------------------
-- 7. Receipt Counters and Payments
-- -----------------------------------------------------------------------------
create table receipt_counters (
  year int primary key,
  last_no int not null default 0
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique not null,
  enrollment_id uuid not null references enrollments(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  mode payment_mode not null,
  purpose payment_purpose not null,
  purpose_note text,
  reference_no text,
  paid_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  received_by uuid not null references profiles(id),
  payee_name text,
  comments text,
  status payment_status not null default 'valid',
  void_reason text,
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  fee_snapshot numeric(12,2) not null,
  paid_before_snapshot numeric(12,2) not null,
  balance_after_snapshot numeric(12,2) not null,
  vat_amount numeric(12,2) not null default 0,
  pdf_path text,
  share_token uuid unique not null default gen_random_uuid(),
  share_enabled boolean not null default true,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);

create index idx_payments_paid_at on payments(paid_at);
create index idx_payments_received_by_paid_at on payments(received_by, paid_at);
create index idx_payments_enrollment_id on payments(enrollment_id);
create index idx_payments_student_id on payments(student_id);
create index idx_payments_share_token on payments(share_token);

-- -----------------------------------------------------------------------------
-- 8. Share Logs & Audit Log
-- -----------------------------------------------------------------------------
create table share_logs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete cascade,
  channel share_channel not null,
  recipient text,
  sent_by uuid references profiles(id),
  sent_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action text not null,
  actor uuid references auth.users(id),
  at timestamptz not null default now(),
  diff jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 9. View: enrollment_ledger (security_invoker = true)
-- -----------------------------------------------------------------------------
create or replace view enrollment_ledger
with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.student_id,
  e.total_fee,
  e.discount,
  (e.total_fee - e.discount)::numeric(12,2) as net_fee,
  coalesce(sum(p.amount) filter (where p.status = 'valid'), 0)::numeric(12,2) as total_paid,
  ((e.total_fee - e.discount) - coalesce(sum(p.amount) filter (where p.status = 'valid'), 0))::numeric(12,2) as balance,
  max(p.paid_at) filter (where p.status = 'valid') as last_payment_at,
  count(p.id) filter (where p.status = 'valid')::int as payment_count
from enrollments e
left join payments p on p.enrollment_id = e.id
group by e.id, e.student_id, e.total_fee, e.discount;

-- -----------------------------------------------------------------------------
-- 10. RPC Functions
-- -----------------------------------------------------------------------------

-- 10.1 record_payment
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
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_enrollment record;
  v_student record;
  v_paid_before numeric(12,2);
  v_net_fee numeric(12,2);
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
  -- a) Require active user
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized: caller is not an active profile';
  end if;

  -- Check idempotency
  if p_idempotency_key is not null then
    select * into v_payment from payments where idempotency_key = p_idempotency_key;
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

  -- Validate paid_at: not future (> 5 mins drift) and max 30 days back
  if p_paid_at > (v_now + interval '5 minutes') then
    raise exception 'Payment date cannot be in the future';
  end if;
  if p_paid_at < (v_now - interval '30 days') then
    raise exception 'Payment date cannot be older than 30 days';
  end if;

  -- b) Lock enrollment row & verify active status
  select * into v_enrollment
  from enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Enrollment not found';
  end if;
  if v_enrollment.status != 'active' then
    raise exception 'Cannot record payment for % enrollment', v_enrollment.status;
  end if;

  -- Student lookup
  select * into v_student from students where id = v_enrollment.student_id;

  -- c) Compute current balance; reject if p_amount > balance
  select coalesce(sum(amount), 0)::numeric(12,2) into v_paid_before
  from payments
  where enrollment_id = p_enrollment_id and status = 'valid';

  v_net_fee := (v_enrollment.total_fee - v_enrollment.discount);
  v_current_balance := v_net_fee - v_paid_before;

  if p_amount > v_current_balance then
    raise exception 'Amount exceeds balance of AED %', trim(to_char(v_current_balance, 'FM999,999,990.00'));
  end if;

  v_balance_after := v_current_balance - p_amount;

  -- e) Upsert receipt_counters for Dubai year with row lock
  v_year := extract(year from (v_now at time zone 'Asia/Dubai'))::int;

  select receipt_prefix, vat_enabled, vat_rate
  into v_prefix, v_vat_enabled, v_vat_rate
  from company_settings
  limit 1;

  if v_prefix is null then
    v_prefix := 'EB-RV';
  end if;

  insert into receipt_counters (year, last_no)
  values (v_year, 1)
  on conflict (year) do update
  set last_no = receipt_counters.last_no + 1
  returning last_no into v_last_no;

  v_receipt_no := v_prefix || '-' || v_year::text || '-' || lpad(v_last_no::text, 5, '0');

  -- f) Compute VAT if enabled (inclusive extraction: amount * rate / (100 + rate))
  if coalesce(v_vat_enabled, false) and coalesce(v_vat_rate, 0) > 0 then
    v_vat_amount := round((p_amount * v_vat_rate) / (100.00 + v_vat_rate), 2);
  else
    v_vat_amount := 0;
  end if;

  -- Payee name defaults to student name
  v_payee := coalesce(nullif(trim(p_payee_name), ''), v_student.full_name);

  -- g) Insert payment with snapshots
  insert into payments (
    receipt_no,
    enrollment_id,
    student_id,
    amount,
    mode,
    purpose,
    purpose_note,
    reference_no,
    paid_at,
    recorded_at,
    received_by,
    payee_name,
    comments,
    status,
    fee_snapshot,
    paid_before_snapshot,
    balance_after_snapshot,
    vat_amount,
    idempotency_key
  ) values (
    v_receipt_no,
    p_enrollment_id,
    v_enrollment.student_id,
    p_amount,
    p_mode,
    p_purpose,
    p_purpose_note,
    p_reference_no,
    p_paid_at,
    v_now,
    v_caller_id,
    v_payee,
    p_comments,
    'valid',
    v_net_fee,
    v_paid_before,
    v_balance_after,
    v_vat_amount,
    p_idempotency_key
  )
  returning * into v_payment;

  -- Write audit log
  insert into audit_log (table_name, row_id, action, actor, at, diff)
  values (
    'payments',
    v_payment.id,
    'record_payment',
    v_caller_id,
    v_now,
    jsonb_build_object(
      'receipt_no', v_receipt_no,
      'amount', p_amount,
      'enrollment_id', p_enrollment_id,
      'student_id', v_enrollment.student_id
    )
  );

  return v_payment;
end;
$$;

revoke all on function public.record_payment from public;
grant execute on function public.record_payment to authenticated;

-- 10.2 void_payment (owner only)
create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_payment payments;
  v_now timestamptz := now();
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_owner() then
    raise exception 'Unauthorized: only owners can void receipts';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Void reason must be at least 5 characters';
  end if;

  select * into v_payment
  from payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status = 'void' then
    raise exception 'Payment has already been voided';
  end if;

  update payments
  set
    status = 'void',
    void_reason = trim(p_reason),
    voided_by = v_caller_id,
    voided_at = v_now
  where id = p_payment_id
  returning * into v_payment;

  insert into audit_log (table_name, row_id, action, actor, at, diff)
  values (
    'payments',
    p_payment_id,
    'void_payment',
    v_caller_id,
    v_now,
    jsonb_build_object('reason', trim(p_reason), 'receipt_no', v_payment.receipt_no)
  );

  return v_payment;
end;
$$;

revoke all on function public.void_payment from public;
grant execute on function public.void_payment to authenticated;

-- 10.3 rotate_share_token (owner or receiving staff)
create or replace function public.rotate_share_token(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_payment payments;
  v_new_token uuid := gen_random_uuid();
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  if not (public.is_owner() or v_payment.received_by = v_caller_id) then
    raise exception 'Unauthorized: only owner or the receiving staff can rotate the link';
  end if;

  update payments
  set share_token = v_new_token
  where id = p_payment_id;

  return v_new_token;
end;
$$;

revoke all on function public.rotate_share_token from public;
grant execute on function public.rotate_share_token to authenticated;

-- 10.4 get_public_receipt (accessible by anon)
create or replace function public.get_public_receipt(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select jsonb_build_object(
    'receipt_no', p.receipt_no,
    'paid_at', p.paid_at,
    'amount', p.amount,
    'mode', p.mode,
    'purpose', p.purpose,
    'purpose_note', p.purpose_note,
    'reference_no', p.reference_no,
    'payee_name', p.payee_name,
    'receiver_name', prof.full_name,
    'comments', p.comments,
    'status', p.status,
    'void_reason', p.void_reason,
    'voided_at', p.voided_at,
    'fee_snapshot', p.fee_snapshot,
    'paid_before_snapshot', p.paid_before_snapshot,
    'balance_after_snapshot', p.balance_after_snapshot,
    'vat_amount', p.vat_amount,
    'student_name', s.full_name,
    'student_code', s.student_code,
    'course_name', c.name,
    'specialization_name', sp.name,
    'university_name', u.name,
    'admission_staff_name', adm.full_name,
    'company', (
      select jsonb_build_object(
        'name', cs.name,
        'address', cs.address,
        'phone', cs.phone,
        'email', cs.email,
        'website', cs.website,
        'trn', cs.trn,
        'footer_note', cs.footer_note
      )
      from company_settings cs
      limit 1
    )
  ) into v_res
  from payments p
  join profiles prof on prof.id = p.received_by
  join students s on s.id = p.student_id
  join enrollments e on e.id = p.enrollment_id
  join universities u on u.id = e.university_id
  join courses c on c.id = e.course_id
  left join specializations sp on sp.id = e.specialization_id
  join profiles adm on adm.id = e.admission_staff_id
  where p.share_token = p_token
    and p.share_enabled = true;

  return v_res;
end;
$$;

grant execute on function public.get_public_receipt(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 11. Row Level Security (RLS)
-- -----------------------------------------------------------------------------

-- Enable RLS on every table
alter table company_settings enable row level security;
alter table profiles enable row level security;
alter table universities enable row level security;
alter table courses enable row level security;
alter table specializations enable row level security;
alter table student_counters enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;
alter table receipt_counters enable row level security;
alter table payments enable row level security;
alter table share_logs enable row level security;
alter table audit_log enable row level security;

-- company_settings policies
create policy "company_settings_select"
  on company_settings for select
  to authenticated
  using (public.is_active_user());

create policy "company_settings_update"
  on company_settings for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- profiles policies
create policy "profiles_select"
  on profiles for select
  to authenticated
  using (id = auth.uid() or public.is_owner());

create policy "profiles_update"
  on profiles for update
  to authenticated
  using (id = auth.uid() or public.is_owner())
  with check (id = auth.uid() or public.is_owner());

-- universities policies
create policy "universities_select"
  on universities for select
  to authenticated
  using (public.is_active_user());

create policy "universities_insert"
  on universities for insert
  to authenticated
  with check (public.is_owner());

create policy "universities_update"
  on universities for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- courses policies
create policy "courses_select"
  on courses for select
  to authenticated
  using (public.is_active_user());

create policy "courses_insert"
  on courses for insert
  to authenticated
  with check (public.is_owner());

create policy "courses_update"
  on courses for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- specializations policies
create policy "specializations_select"
  on specializations for select
  to authenticated
  using (public.is_active_user());

create policy "specializations_insert"
  on specializations for insert
  to authenticated
  with check (public.is_owner());

create policy "specializations_update"
  on specializations for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- students policies
create policy "students_select"
  on students for select
  to authenticated
  using (public.is_active_user());

create policy "students_insert"
  on students for insert
  to authenticated
  with check (public.is_active_user() and created_by = auth.uid());

create policy "students_update"
  on students for update
  to authenticated
  using (public.is_owner() or created_by = auth.uid())
  with check (public.is_owner() or created_by = auth.uid());
-- No delete policy on students

-- enrollments policies
create policy "enrollments_select"
  on enrollments for select
  to authenticated
  using (public.is_active_user());

create policy "enrollments_insert"
  on enrollments for insert
  to authenticated
  with check (public.is_active_user() and created_by = auth.uid());

create policy "enrollments_update"
  on enrollments for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- payments policies: select only, NO insert/update/delete (RPC only)
create policy "payments_select"
  on payments for select
  to authenticated
  using (public.is_active_user());

-- share_logs policies
create policy "share_logs_select"
  on share_logs for select
  to authenticated
  using (public.is_active_user());

create policy "share_logs_insert"
  on share_logs for insert
  to authenticated
  with check (public.is_active_user());

-- audit_log policies: owner select only, no client writes
create policy "audit_log_select"
  on audit_log for select
  to authenticated
  using (public.is_owner());

-- receipt_counters & student_counters have NO client policies (accessed only via security definer RPCs/triggers)

-- -----------------------------------------------------------------------------
-- 12. Storage Buckets (receipts and branding)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', false)
on conflict (id) do nothing;

-- Storage policies: authenticated active users can read receipts and branding
create policy "receipts_select_active_user"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts' and public.is_active_user());

create policy "branding_select_active_user"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'branding' and public.is_active_user());
