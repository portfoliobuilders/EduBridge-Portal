-- =============================================================================
-- Migration: 0013_share_and_statement_extensions.sql
-- Description:
--   1. Adds share_token and share_enabled to enrollments table.
--   2. Adds public RPC get_public_statement for verified anon access to statements.
--   3. Adds RPCs to toggle sharing and rotate share tokens for enrollments and payments.
--   4. Creates email_rate_limits table (20 emails/user/hr) and rate check RPC.
--   5. Sets up statements storage bucket and security policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enrollments Share Token and State
-- -----------------------------------------------------------------------------
alter table public.enrollments
  add column if not exists share_token uuid unique not null default gen_random_uuid(),
  add column if not exists share_enabled boolean not null default true;

create index if not exists idx_enrollments_share_token on public.enrollments(share_token);

-- -----------------------------------------------------------------------------
-- 2. Toggle Payment Share Enabled (Owner or Received-By Staff)
-- -----------------------------------------------------------------------------
create or replace function public.set_payment_share_enabled(
  p_payment_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_payment public.payments%rowtype;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  if not (public.is_owner() or v_payment.received_by = v_caller_id) then
    raise exception 'Unauthorized: only owner or receiving staff can update share status';
  end if;

  update public.payments
  set share_enabled = p_enabled
  where id = p_payment_id;

  return p_enabled;
end;
$$;

revoke all on function public.set_payment_share_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_payment_share_enabled(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Rotate Enrollment Share Token (Owner or Admission Staff)
-- -----------------------------------------------------------------------------
create or replace function public.rotate_enrollment_share_token(
  p_enrollment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_enrollment public.enrollments%rowtype;
  v_new_token uuid := gen_random_uuid();
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'Enrollment not found';
  end if;

  if not (public.is_owner() or v_enrollment.admission_staff_id = v_caller_id) then
    raise exception 'Unauthorized: only owner or admission staff can rotate statement link';
  end if;

  update public.enrollments
  set share_token = v_new_token
  where id = p_enrollment_id;

  return v_new_token;
end;
$$;

revoke all on function public.rotate_enrollment_share_token(uuid) from public, anon;
grant execute on function public.rotate_enrollment_share_token(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Toggle Enrollment Share Enabled (Owner or Admission Staff)
-- -----------------------------------------------------------------------------
create or replace function public.set_enrollment_share_enabled(
  p_enrollment_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_enrollment public.enrollments%rowtype;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'Enrollment not found';
  end if;

  if not (public.is_owner() or v_enrollment.admission_staff_id = v_caller_id) then
    raise exception 'Unauthorized: only owner or admission staff can update statement share status';
  end if;

  update public.enrollments
  set share_enabled = p_enabled
  where id = p_enrollment_id;

  return p_enabled;
end;
$$;

revoke all on function public.set_enrollment_share_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_enrollment_share_enabled(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Public RPC: get_public_statement (Anon & Authenticated)
-- -----------------------------------------------------------------------------
create or replace function public.get_public_statement(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
  v_enrollment_id uuid;
  v_year int := extract(year from timezone('Asia/Dubai', now()))::int;
begin
  select e.id into v_enrollment_id
  from public.enrollments e
  where e.share_token = p_token
    and e.share_enabled = true;

  if v_enrollment_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'statement_no', 'EB-FS-' || v_year::text || '-' || upper(substring(e.id::text from 1 for 6)),
    'enrollment_id', e.id,
    'intake', e.intake,
    'total_fee', e.total_fee,
    'discount', e.discount,
    'vat_type', e.vat_type,
    'vat_rate', e.vat_rate,
    'status', e.status,
    'student_name', s.full_name,
    'student_code', s.student_code,
    'course_name', c.name,
    'specialization_name', sp.name,
    'university_name', u.name,
    'net_fee', l.net_fee,
    'vat_amount', l.vat_amount,
    'total_payable', l.total_payable,
    'total_paid', l.total_paid,
    'balance', l.balance,
    'opening_paid', coalesce(l.opening_paid, e.opening_paid, 0),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'receipt_no', p.receipt_no,
          'amount', p.amount,
          'paid_at', p.paid_at,
          'mode', p.mode,
          'purpose', p.purpose,
          'purpose_note', p.purpose_note,
          'reference_no', p.reference_no,
          'status', p.status
        ) order by p.paid_at asc
      )
      from public.payments p
      where p.enrollment_id = e.id
    ), '[]'::jsonb),
    'billing_address', (
      select jsonb_build_object(
        'contact_name', sa.contact_name,
        'contact_phone', sa.contact_phone,
        'line1', sa.line1,
        'line2', sa.line2,
        'city', sa.city,
        'state', sa.state,
        'postal_code', sa.postal_code,
        'country', sa.country
      )
      from public.student_addresses sa
      where sa.student_id = s.id
        and sa.type = 'billing'
        and sa.is_default = true
      limit 1
    ),
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
      from public.company_settings cs
      limit 1
    )
  ) into v_res
  from public.enrollments e
  join public.students s on s.id = e.student_id
  join public.universities u on u.id = e.university_id
  join public.courses c on c.id = e.course_id
  left join public.specializations sp on sp.id = e.specialization_id
  left join public.enrollment_ledger l on l.enrollment_id = e.id
  where e.id = v_enrollment_id;

  return v_res;
end;
$$;

revoke all on function public.get_public_statement(uuid) from public;
grant execute on function public.get_public_statement(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Email Rate Limiting (20 emails per user per hour)
-- -----------------------------------------------------------------------------
create table if not exists public.email_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient text not null,
  email_type text not null, -- 'receipt' | 'statement'
  reference_id text not null, -- receipt_no or statement_no
  sent_at timestamptz not null default now()
);

alter table public.email_rate_limits enable row level security;
create index if not exists idx_email_rate_limits_user_sent on public.email_rate_limits(user_id, sent_at);

-- Policies
create policy "email_rate_limits_select"
  on public.email_rate_limits for select
  to authenticated
  using (user_id = auth.uid() or public.is_owner());

create policy "email_rate_limits_insert"
  on public.email_rate_limits for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

-- Revoke anon access to email_rate_limits table
revoke all on table public.email_rate_limits from anon;
grant select, insert on table public.email_rate_limits to authenticated;

-- Function to check and log email rate limit atomically
create or replace function public.check_and_log_email_rate_limit(
  p_recipient text,
  p_email_type text,
  p_reference_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_recent_count int;
  c_limit constant int := 20;
begin
  v_user_id := auth.uid();
  if v_user_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  -- Count emails sent by caller in the past 60 minutes
  select count(*) into v_recent_count
  from public.email_rate_limits
  where user_id = v_user_id
    and sent_at > (now() - interval '1 hour');

  if v_recent_count >= c_limit then
    raise exception 'Email rate limit exceeded: maximum % emails per hour. Please wait before sending again.', c_limit;
  end if;

  -- Insert record
  insert into public.email_rate_limits (user_id, recipient, email_type, reference_id)
  values (v_user_id, p_recipient, p_email_type, p_reference_id);

  return jsonb_build_object(
    'allowed', true,
    'sent_in_hour', v_recent_count + 1,
    'remaining', c_limit - (v_recent_count + 1)
  );
end;
$$;

revoke all on function public.check_and_log_email_rate_limit(text, text, text) from public, anon;
grant execute on function public.check_and_log_email_rate_limit(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Storage Bucket for Statements
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

drop policy if exists "statements_select_active_user" on storage.objects;
create policy "statements_select_active_user"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'statements' and public.is_active_user());
