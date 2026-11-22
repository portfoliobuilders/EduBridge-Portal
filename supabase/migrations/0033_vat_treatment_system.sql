-- =============================================================================
-- Migration: 0031_vat_treatment_system.sql
-- Description:
--   Complete VAT Treatment System ("with tax / without tax" Swipe-style):
--   1. company_settings: default_vat_treatment, no_vat_reason, TRN guard
--   2. enrollments: vat_treatment, no_vat_reason, creation snapshot, payment lock trigger
--   3. payments: vat_treatment, taxable_amount
--   4. enrollment_ledger view: net_fee, taxable, vat_total, total_payable, total_paid, balance
--   5. record_payment RPC: exact rounding reconciliation on balance = 0, taxable_amount
--   6. update_enrollment_fee: total_payable floor check
--   7. create_student_with_enrollment & add_student_enrollment: total_payable floor, force 'none' when vat_enabled = false
--   8. report_vat_summary & report_collections: treatment breakdown & taxable columns
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Company Settings: default_vat_treatment, no_vat_reason, TRN constraint
-- -----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists default_vat_treatment text not null default 'exclusive' check (default_vat_treatment in ('exclusive', 'inclusive', 'none')),
  add column if not exists no_vat_reason text not null default 'zero_rated' check (no_vat_reason in ('zero_rated', 'exempt', 'out_of_scope'));

-- Enforce TRN required when vat_enabled is true
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_trn_required_when_vat_enabled'
  ) then
    alter table public.company_settings
      add constraint company_settings_trn_required_when_vat_enabled
      check (not vat_enabled or (trn is not null and trim(trn) <> ''));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Enrollments: vat_treatment, no_vat_reason, backfill & constraints
-- -----------------------------------------------------------------------------
alter table public.enrollments
  add column if not exists vat_treatment text check (vat_treatment in ('exclusive', 'inclusive', 'none')),
  add column if not exists no_vat_reason text check (no_vat_reason in ('zero_rated', 'exempt', 'out_of_scope'));

-- Backfill enrollments
update public.enrollments
set vat_treatment = coalesce(vat_type, 'inclusive')
where vat_treatment is null;

update public.enrollments
set no_vat_reason = 'zero_rated'
where vat_treatment = 'none' and no_vat_reason is null;

alter table public.enrollments
  alter column vat_treatment set not null,
  alter column vat_treatment set default 'exclusive';

-- -----------------------------------------------------------------------------
-- 3. Payments: vat_treatment, taxable_amount, backfill & constraints
-- -----------------------------------------------------------------------------
alter table public.payments
  add column if not exists vat_treatment text check (vat_treatment in ('exclusive', 'inclusive', 'none')),
  add column if not exists taxable_amount numeric(12,2);

-- Backfill payments
update public.payments
set vat_treatment = coalesce(vat_type, 'inclusive')
where vat_treatment is null;

update public.payments
set taxable_amount = round(amount - coalesce(vat_amount, 0), 2)
where taxable_amount is null;

alter table public.payments
  alter column vat_treatment set not null,
  alter column vat_treatment set default 'exclusive',
  alter column taxable_amount set not null,
  alter column taxable_amount set default 0.00;

-- -----------------------------------------------------------------------------
-- 4. Update Views: enrollment_ledger and student_directory_view
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
  e.vat_treatment,
  e.vat_treatment as vat_type, -- backward compatibility alias
  e.vat_rate,
  e.no_vat_reason,
  case
    when e.vat_treatment = 'inclusive' then
      ((e.total_fee - e.discount) - round((e.total_fee - e.discount) * e.vat_rate / (100.00 + e.vat_rate), 2))
    else
      (e.total_fee - e.discount)
  end::numeric(12,2) as taxable,
  case
    when e.vat_treatment = 'exclusive' then
      round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2)
    when e.vat_treatment = 'inclusive' then
      round((e.total_fee - e.discount) * e.vat_rate / (100.00 + e.vat_rate), 2)
    else 0.00
  end::numeric(12,2) as vat_total,
  -- vat_amount retained as alias to vat_total for backward compatibility
  case
    when e.vat_treatment = 'exclusive' then
      round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2)
    when e.vat_treatment = 'inclusive' then
      round((e.total_fee - e.discount) * e.vat_rate / (100.00 + e.vat_rate), 2)
    else 0.00
  end::numeric(12,2) as vat_amount,
  case
    when e.vat_treatment = 'exclusive' then
      ((e.total_fee - e.discount) + round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2))
    else
      (e.total_fee - e.discount)
  end::numeric(12,2) as total_payable,
  (coalesce(e.opening_paid, 0) + coalesce(sum(p.amount) filter (where p.status = 'valid'), 0))::numeric(12,2) as total_paid,
  (
    case
      when e.vat_treatment = 'exclusive' then
        ((e.total_fee - e.discount) + round((e.total_fee - e.discount) * (e.vat_rate / 100.00), 2))
      else
        (e.total_fee - e.discount)
    end
    - (coalesce(e.opening_paid, 0) + coalesce(sum(p.amount) filter (where p.status = 'valid'), 0))
  )::numeric(12,2) as balance,
  e.opening_paid,
  e.opening_paid_note,
  max(p.paid_at) filter (where p.status = 'valid') as last_payment_at,
  count(p.id) filter (where p.status = 'valid')::int as payment_count
from public.enrollments e
left join public.payments p on p.enrollment_id = e.id
group by
  e.id,
  e.student_id,
  e.total_fee,
  e.discount,
  e.vat_treatment,
  e.vat_rate,
  e.no_vat_reason,
  e.opening_paid,
  e.opening_paid_note;

grant select on public.enrollment_ledger to authenticated;
revoke all on public.enrollment_ledger from public, anon;

-- Recreate student_directory_view
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
  s.is_active,
  s.created_by,
  s.created_at,
  s.updated_at,
  case
    when count(e.id) filter (where e.status = 'active') = 0 then 'No enrollment'
    when coalesce(sum(el.balance) filter (where e.status = 'active'), 0) <= 0 then 'Fully paid'
    when coalesce(sum(el.balance) filter (where e.status = 'active'), 0) > 0 and (
      (max(el.last_payment_at) filter (where e.status = 'active') is not null and max(el.last_payment_at) filter (where e.status = 'active') < (now() - interval '30 days'))
      or
      (max(el.last_payment_at) filter (where e.status = 'active') is null and min(e.created_at) filter (where e.status = 'active') < (now() - interval '30 days'))
    ) then 'Overdue'
    else 'Balance due'
  end as candidate_status,
  coalesce(sum(el.balance) filter (where e.status = 'active'), 0)::numeric(12,2) as total_balance,
  coalesce(sum(el.total_paid) filter (where e.status = 'active'), 0)::numeric(12,2) as total_paid,
  coalesce(sum(el.total_payable) filter (where e.status = 'active'), 0)::numeric(12,2) as total_net_fee,
  max(el.last_payment_at) filter (where e.status = 'active') as last_payment_at,
  count(distinct e.id) filter (where e.status = 'active')::int as enrollment_count,
  string_agg(distinct u.name, ', ') filter (where e.status = 'active') as university_names,
  string_agg(distinct c.name, ', ') filter (where e.status = 'active') as course_names,
  array_remove(array_agg(distinct e.university_id) filter (where e.status = 'active'), null) as university_ids,
  array_remove(array_agg(distinct e.course_id) filter (where e.status = 'active'), null) as course_ids,
  (select count(distinct cd.document_type_id) from public.candidate_documents cd where cd.student_id = s.id and cd.archived_at is null)::int as verified_docs_count,
  (select count(*) from public.document_types dt where dt.is_active = true)::int as total_doc_types_count
from public.students s
left join public.enrollments e on e.student_id = s.id
left join public.enrollment_ledger el on el.enrollment_id = e.id
left join public.universities u on u.id = e.university_id
left join public.courses c on c.id = e.course_id
where s.is_active = true
group by s.id;

grant select on public.student_directory_view to authenticated;
revoke all on public.student_directory_view from public, anon;

-- -----------------------------------------------------------------------------
-- 5. Lock Trigger on enrollments: vat_treatment & vat_rate locked once payments exist
-- -----------------------------------------------------------------------------
create or replace function public.check_enrollment_vat_lock()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_has_payments boolean;
  v_uid uuid := auth.uid();
  v_caller_role text;
begin
  if (old.vat_treatment is distinct from new.vat_treatment) or (old.vat_rate is distinct from new.vat_rate) then
    select exists (
      select 1 from public.payments
      where enrollment_id = old.id and status = 'valid'
    ) into v_has_payments;

    if v_has_payments then
      raise exception 'VAT treatment and VAT rate cannot be changed once valid payments exist for an enrollment';
    end if;

    -- Before payments: only admission staff, admin in scope, or super_admin may modify
    if v_uid is not null then
      select role::text into v_caller_role from public.profiles where id = v_uid;
      if v_caller_role in ('super_admin', 'owner') then
        -- allowed
      elsif v_caller_role = 'admin' then
        if not (old.admission_staff_id in (select * from public.visible_user_ids())) then
          raise exception 'Admins can only edit enrollments within their scope.';
        end if;
      elsif v_caller_role = 'staff' then
        if old.admission_staff_id != v_uid and old.created_by != v_uid then
          raise exception 'Staff can only change VAT treatment on their own enrollments.';
        end if;
      else
        raise exception 'Forbidden: unauthorized to edit enrollment VAT treatment';
      end if;

      insert into public.audit_log (
        action, table_name, record_id, user_id, details
      ) values (
        'update_enrollment_vat_treatment',
        'enrollments',
        old.id,
        v_uid,
        jsonb_build_object(
          'old_treatment', old.vat_treatment,
          'new_treatment', new.vat_treatment,
          'old_rate', old.vat_rate,
          'new_rate', new.vat_rate,
          'old_reason', old.no_vat_reason,
          'new_reason', new.no_vat_reason
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lock_enrollment_vat on public.enrollments;
create trigger trg_lock_enrollment_vat
  before update on public.enrollments
  for each row
  execute function public.check_enrollment_vat_lock();

-- -----------------------------------------------------------------------------
-- 6. Rewrite record_payment RPC with exact rounding reconciliation
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
  v_net_fee numeric(12,2);
  v_enrollment_vat_total numeric(12,2);
  v_total_payable numeric(12,2);
  v_current_balance numeric(12,2);
  v_balance_after numeric(12,2);
  v_year int;
  v_prefix text;
  v_last_no int;
  v_receipt_no text;
  v_vat_amount numeric(12,2) := 0;
  v_taxable_amount numeric(12,2) := 0;
  v_prior_vat numeric(12,2) := 0;
  v_opening_vat numeric(12,2) := 0;
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

  -- Calculate total payable according to enrollment's vat_treatment
  v_net_fee := (v_enrollment.total_fee - v_enrollment.discount)::numeric(12,2);
  if v_enrollment.vat_treatment = 'exclusive' then
    v_enrollment_vat_total := round(v_net_fee * (v_enrollment.vat_rate / 100.00), 2);
    v_total_payable := (v_net_fee + v_enrollment_vat_total)::numeric(12,2);
  elsif v_enrollment.vat_treatment = 'inclusive' then
    v_enrollment_vat_total := round(v_net_fee * v_enrollment.vat_rate / (100.00 + v_enrollment.vat_rate), 2);
    v_total_payable := v_net_fee;
  else
    v_enrollment_vat_total := 0.00;
    v_total_payable := v_net_fee;
  end if;

  v_current_balance := (v_total_payable - v_paid_before)::numeric(12,2);

  if p_amount > v_current_balance then
    raise exception 'Amount exceeds balance of AED %', trim(to_char(v_current_balance, 'FM999,999,990.00'));
  end if;

  v_balance_after := (v_current_balance - p_amount)::numeric(12,2);

  -- Upsert receipt_counters for Dubai year
  v_year := extract(year from (v_now at time zone 'Asia/Dubai'))::int;

  select receipt_prefix into v_prefix
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

  -- Compute VAT amount and taxable amount with Rounding Reconciliation
  if v_enrollment.vat_treatment = 'none' then
    v_vat_amount := 0.00;
    v_taxable_amount := p_amount::numeric(12,2);
  else
    if v_balance_after = 0.00 then
      -- Final payment bringing balance to 0: reconcile rounding exactly
      if coalesce(v_enrollment.opening_paid, 0) > 0 then
        v_opening_vat := round(v_enrollment.opening_paid * v_enrollment.vat_rate / (100.00 + v_enrollment.vat_rate), 2);
      else
        v_opening_vat := 0.00;
      end if;

      select coalesce(sum(vat_amount), 0.00)::numeric(12,2)
      into v_prior_vat
      from public.payments
      where enrollment_id = p_enrollment_id and status = 'valid';

      v_vat_amount := (v_enrollment_vat_total - v_prior_vat - v_opening_vat)::numeric(12,2);
      v_taxable_amount := (p_amount - v_vat_amount)::numeric(12,2);
    else
      v_vat_amount := round((p_amount * v_enrollment.vat_rate) / (100.00 + v_enrollment.vat_rate), 2);
      v_taxable_amount := (p_amount - v_vat_amount)::numeric(12,2);
    end if;
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
    taxable_amount,
    vat_treatment,
    vat_type,
    vat_rate,
    idempotency_key
  )
  values (
    v_receipt_no,
    p_enrollment_id,
    v_enrollment.student_id,
    p_amount,
    p_mode,
    p_purpose,
    p_purpose_note,
    null,
    p_paid_at,
    v_caller_id,
    v_payee,
    p_comments,
    'valid',
    v_total_payable,
    v_paid_before,
    v_balance_after,
    v_vat_amount,
    v_taxable_amount,
    v_enrollment.vat_treatment,
    v_enrollment.vat_treatment,
    v_enrollment.vat_rate,
    p_idempotency_key
  )
  returning * into v_payment;

  -- Audit log entry
  insert into public.audit_log (
    action,
    table_name,
    record_id,
    user_id,
    details
  )
  values (
    'record_payment',
    'payments',
    v_payment.id,
    v_caller_id,
    jsonb_build_object(
      'receipt_no', v_receipt_no,
      'amount', p_amount,
      'taxable_amount', v_taxable_amount,
      'vat_amount', v_vat_amount,
      'vat_treatment', v_enrollment.vat_treatment,
      'mode', p_mode,
      'enrollment_id', p_enrollment_id,
      'student_id', v_enrollment.student_id
    )
  );

  return v_payment;
end;
$$;

revoke all on function public.record_payment(uuid, numeric, payment_mode, payment_purpose, text, text, timestamptz, text, text, uuid) from public, anon;
grant execute on function public.record_payment(uuid, numeric, payment_mode, payment_purpose, text, text, timestamptz, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Rewrite update_enrollment_fee RPC with total_payable fee floor check
-- -----------------------------------------------------------------------------
drop function if exists public.update_enrollment_fee(uuid, numeric, numeric, text);

create or replace function public.update_enrollment_fee(
  p_enrollment_id uuid,
  p_total_fee numeric,
  p_discount numeric,
  p_reason text default null,
  p_vat_treatment text default null,
  p_no_vat_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_enrollment record;
  v_payment_count int;
  v_total_paid numeric(12,2);
  v_effective_treatment text;
  v_effective_rate numeric(5,2);
  v_effective_reason text;
  v_new_net_fee numeric(12,2);
  v_new_vat_total numeric(12,2);
  v_new_total_payable numeric(12,2);
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  if v_caller_role in ('super_admin', 'owner') then
    -- allowed
  elsif v_caller_role = 'admin' then
    if not (v_enrollment.admission_staff_id in (select * from public.visible_user_ids())) then
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

  -- Count valid payments and compute total paid so far
  select count(*), coalesce(sum(amount), 0)
  into v_payment_count, v_total_paid
  from public.payments
  where enrollment_id = p_enrollment_id
    and status = 'valid';

  v_total_paid := (v_total_paid + coalesce(v_enrollment.opening_paid, 0))::numeric(12,2);

  if v_payment_count > 0 and (p_reason is null or trim(p_reason) = '') then
    raise exception 'A reason is required to modify fees when payments already exist';
  end if;

  -- Determine effective VAT treatment
  v_effective_rate := v_enrollment.vat_rate;
  if p_vat_treatment is not null and p_vat_treatment != v_enrollment.vat_treatment then
    if v_payment_count > 0 then
      raise exception 'VAT treatment and VAT rate cannot be changed once valid payments exist for an enrollment';
    end if;
    v_effective_treatment := p_vat_treatment;
  else
    v_effective_treatment := v_enrollment.vat_treatment;
  end if;

  if v_effective_treatment = 'none' then
    v_effective_reason := coalesce(p_no_vat_reason, v_enrollment.no_vat_reason, 'zero_rated');
  else
    v_effective_reason := null;
  end if;

  -- Calculate new total payable
  v_new_net_fee := (p_total_fee - p_discount)::numeric(12,2);
  if v_effective_treatment = 'exclusive' then
    v_new_vat_total := round(v_new_net_fee * (v_effective_rate / 100.00), 2);
    v_new_total_payable := (v_new_net_fee + v_new_vat_total)::numeric(12,2);
  elsif v_effective_treatment = 'inclusive' then
    v_new_vat_total := round(v_new_net_fee * v_effective_rate / (100.00 + v_effective_rate), 2);
    v_new_total_payable := v_new_net_fee;
  else
    v_new_vat_total := 0.00;
    v_new_total_payable := v_new_net_fee;
  end if;

  -- Floor check: total_payable cannot go below total_paid
  if v_new_total_payable < v_total_paid then
    raise exception 'Total payable (AED %) cannot be reduced below total already paid (AED %)',
      trim(to_char(v_new_total_payable, 'FM999,999,990.00')),
      trim(to_char(v_total_paid, 'FM999,999,990.00'));
  end if;

  update public.enrollments
  set
    total_fee = p_total_fee,
    discount = p_discount,
    vat_treatment = v_effective_treatment,
    vat_type = v_effective_treatment,
    no_vat_reason = v_effective_reason,
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
      'old_total_fee', v_enrollment.total_fee,
      'new_total_fee', p_total_fee,
      'old_discount', v_enrollment.discount,
      'new_discount', p_discount,
      'vat_treatment', v_effective_treatment,
      'new_total_payable', v_new_total_payable,
      'total_paid', v_total_paid,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'total_fee', p_total_fee,
    'discount', p_discount,
    'total_payable', v_new_total_payable
  );
end;
$$;

revoke all on function public.update_enrollment_fee(uuid, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.update_enrollment_fee(uuid, numeric, numeric, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Rewrite create_student_with_enrollment RPC
-- -----------------------------------------------------------------------------
drop function if exists public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, text, text, text, text, numeric, text, jsonb, jsonb);

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
  p_vat_type text default null,
  p_vat_rate numeric default null,
  p_guardian_name text default null,
  p_guardian_relation text default null,
  p_guardian_phone text default null,
  p_guardian_whatsapp text default null,
  p_guardian_email text default null,
  p_opening_paid numeric default 0,
  p_opening_paid_note text default null,
  p_billing_address jsonb default null,
  p_shipping_address jsonb default null,
  p_vat_treatment text default null,
  p_no_vat_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_student_id uuid;
  v_student_code text;
  v_enrollment_id uuid;
  v_admission_staff_id uuid;
  v_clean_mobile text;
  v_clean_whatsapp text;
  v_existing_code text;
  v_opening_paid numeric := coalesce(p_opening_paid, 0);
  v_comp_vat_enabled boolean;
  v_comp_vat_rate numeric(5,2);
  v_comp_treatment text;
  v_comp_reason text;
  v_effective_treatment text;
  v_effective_rate numeric(5,2);
  v_effective_reason text;
  v_net_fee numeric(12,2);
  v_total_payable numeric(12,2);
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized: inactive or unauthenticated user';
  end if;

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

  if p_guardian_relation is not null and trim(p_guardian_relation) != '' then
    if trim(p_guardian_relation) not in ('father','mother','guardian','spouse','other') then
      raise exception 'Invalid guardian relation: %', p_guardian_relation;
    end if;
  end if;

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

  -- Fetch company settings defaults
  select vat_enabled, vat_rate, default_vat_treatment, no_vat_reason
  into v_comp_vat_enabled, v_comp_vat_rate, v_comp_treatment, v_comp_reason
  from public.company_settings
  limit 1;

  -- If company is NOT VAT registered, force treatment to 'none'
  if not coalesce(v_comp_vat_enabled, false) then
    v_effective_treatment := 'none';
    v_effective_rate := coalesce(v_comp_vat_rate, 5.00);
    v_effective_reason := coalesce(p_no_vat_reason, v_comp_reason, 'zero_rated');
  else
    v_effective_treatment := coalesce(p_vat_treatment, p_vat_type, v_comp_treatment, 'exclusive');
    v_effective_rate := coalesce(p_vat_rate, v_comp_vat_rate, 5.00);
    if v_effective_treatment = 'none' then
      v_effective_reason := coalesce(p_no_vat_reason, v_comp_reason, 'zero_rated');
    else
      v_effective_reason := null;
    end if;
  end if;

  if v_effective_treatment not in ('inclusive', 'exclusive', 'none') then
    raise exception 'Invalid VAT treatment: %', v_effective_treatment;
  end if;

  -- Calculate total payable and verify floor against opening_paid
  v_net_fee := (p_total_fee - coalesce(p_discount, 0))::numeric(12,2);
  if v_effective_treatment = 'exclusive' then
    v_total_payable := (v_net_fee + round(v_net_fee * (v_effective_rate / 100.00), 2))::numeric(12,2);
  else
    v_total_payable := v_net_fee;
  end if;

  if v_total_payable < v_opening_paid then
    raise exception 'Total payable (AED %) cannot be less than opening paid (AED %)',
      v_total_payable, v_opening_paid;
  end if;

  v_is_admin := public.is_admin_or_above();

  if p_admission_staff_id is not null and p_admission_staff_id != v_uid then
    if not v_is_admin then
      raise exception 'Forbidden: staff can only assign themselves as admission staff';
    end if;
    if not exists (select 1 from public.profiles where id = p_admission_staff_id and is_active = true) then
      raise exception 'Assigned admission staff not found or inactive';
    end if;
    v_admission_staff_id := p_admission_staff_id;
  else
    v_admission_staff_id := v_uid;
  end if;

  -- Insert Student
  insert into public.students (
    full_name,
    mobile,
    whatsapp,
    email,
    notes,
    created_by,
    guardian_name,
    guardian_relation,
    guardian_phone,
    guardian_whatsapp,
    guardian_email,
    billing_address,
    shipping_address
  )
  values (
    trim(p_full_name),
    v_clean_mobile,
    v_clean_whatsapp,
    nullif(trim(p_email), ''),
    nullif(trim(p_notes), ''),
    v_uid,
    nullif(trim(p_guardian_name), ''),
    nullif(trim(p_guardian_relation), ''),
    nullif(trim(p_guardian_phone), ''),
    nullif(trim(p_guardian_whatsapp), ''),
    nullif(trim(p_guardian_email), ''),
    p_billing_address,
    p_shipping_address
  )
  returning id, student_code into v_student_id, v_student_code;

  -- Insert Enrollment
  insert into public.enrollments (
    student_id,
    university_id,
    course_id,
    specialization_id,
    admission_staff_id,
    intake,
    total_fee,
    discount,
    created_by,
    vat_treatment,
    vat_type,
    vat_rate,
    no_vat_reason,
    opening_paid,
    opening_paid_note
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
    v_uid,
    v_effective_treatment,
    v_effective_treatment,
    v_effective_rate,
    v_effective_reason,
    v_opening_paid,
    nullif(trim(p_opening_paid_note), '')
  )
  returning id into v_enrollment_id;

  return jsonb_build_object(
    'student_id', v_student_id,
    'student_code', v_student_code,
    'enrollment_id', v_enrollment_id
  );
end;
$$;

revoke all on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, text, text, text, text, numeric, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.create_student_with_enrollment(text, text, text, text, text, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, text, text, text, text, numeric, text, jsonb, jsonb, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Rewrite add_student_enrollment RPC
-- -----------------------------------------------------------------------------
drop function if exists public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid);

create or replace function public.add_student_enrollment(
  p_student_id uuid,
  p_university_id uuid,
  p_course_id uuid,
  p_specialization_id uuid default null,
  p_total_fee numeric default null,
  p_discount numeric default 0,
  p_intake text default null,
  p_admission_staff_id uuid default null,
  p_vat_treatment text default null,
  p_vat_rate numeric default null,
  p_no_vat_reason text default null,
  p_opening_paid numeric default 0,
  p_opening_paid_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_admission_staff_id uuid;
  v_enrollment_id uuid;
  v_comp_vat_enabled boolean;
  v_comp_vat_rate numeric(5,2);
  v_comp_treatment text;
  v_comp_reason text;
  v_effective_treatment text;
  v_effective_rate numeric(5,2);
  v_effective_reason text;
  v_net_fee numeric(12,2);
  v_total_payable numeric(12,2);
  v_opening_paid numeric := coalesce(p_opening_paid, 0);
begin
  if v_uid is null or not public.is_active_user() then
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

  if v_opening_paid < 0 then
    raise exception 'Opening paid must be >= 0';
  end if;

  -- Fetch company settings defaults
  select vat_enabled, vat_rate, default_vat_treatment, no_vat_reason
  into v_comp_vat_enabled, v_comp_vat_rate, v_comp_treatment, v_comp_reason
  from public.company_settings
  limit 1;

  if not coalesce(v_comp_vat_enabled, false) then
    v_effective_treatment := 'none';
    v_effective_rate := coalesce(v_comp_vat_rate, 5.00);
    v_effective_reason := coalesce(p_no_vat_reason, v_comp_reason, 'zero_rated');
  else
    v_effective_treatment := coalesce(p_vat_treatment, v_comp_treatment, 'exclusive');
    v_effective_rate := coalesce(p_vat_rate, v_comp_vat_rate, 5.00);
    if v_effective_treatment = 'none' then
      v_effective_reason := coalesce(p_no_vat_reason, v_comp_reason, 'zero_rated');
    else
      v_effective_reason := null;
    end if;
  end if;

  v_net_fee := (p_total_fee - coalesce(p_discount, 0))::numeric(12,2);
  if v_effective_treatment = 'exclusive' then
    v_total_payable := (v_net_fee + round(v_net_fee * (v_effective_rate / 100.00), 2))::numeric(12,2);
  else
    v_total_payable := v_net_fee;
  end if;

  if v_total_payable < v_opening_paid then
    raise exception 'Total payable (AED %) cannot be less than opening paid (AED %)',
      v_total_payable, v_opening_paid;
  end if;

  v_is_admin := public.is_admin_or_above();

  if p_admission_staff_id is not null and p_admission_staff_id != v_uid then
    if not v_is_admin then
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
    created_by,
    vat_treatment,
    vat_type,
    vat_rate,
    no_vat_reason,
    opening_paid,
    opening_paid_note
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
    v_uid,
    v_effective_treatment,
    v_effective_treatment,
    v_effective_rate,
    v_effective_reason,
    v_opening_paid,
    nullif(trim(p_opening_paid_note), '')
  )
  returning id into v_enrollment_id;

  return jsonb_build_object(
    'enrollment_id', v_enrollment_id,
    'student_id', p_student_id
  );
end;
$$;

revoke all on function public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, numeric, text) from public, anon;
grant execute on function public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid, text, numeric, text, numeric, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Rewrite report_vat_summary with treatment breakdown
-- -----------------------------------------------------------------------------
create or replace function public.report_vat_summary(
  p_year int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_year int;
  v_vat_enabled boolean;
  v_rows jsonb := '[]'::jsonb;
  v_totals jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select vat_enabled into v_vat_enabled from public.company_settings limit 1;

  if p_year is null then
    v_year := extract(year from timezone('Asia/Dubai', now()))::int;
  else
    v_year := p_year;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month_num', m.month_num,
      'month_name', to_char(to_date(m.month_num::text, 'MM'), 'Month'),
      'taxable_amount', coalesce(sub.taxable, 0.00)::numeric(12,2),
      'vat_collected', coalesce(sub.vat, 0.00)::numeric(12,2),
      'total_collected', coalesce(sub.tot, 0.00)::numeric(12,2),
      'receipt_count', coalesce(sub.cnt, 0),
      'by_treatment', jsonb_build_object(
        'exclusive', jsonb_build_object(
          'taxable', coalesce(sub.excl_taxable, 0.00)::numeric(12,2),
          'vat', coalesce(sub.excl_vat, 0.00)::numeric(12,2),
          'total', coalesce(sub.excl_tot, 0.00)::numeric(12,2),
          'count', coalesce(sub.excl_cnt, 0)
        ),
        'inclusive', jsonb_build_object(
          'taxable', coalesce(sub.incl_taxable, 0.00)::numeric(12,2),
          'vat', coalesce(sub.incl_vat, 0.00)::numeric(12,2),
          'total', coalesce(sub.incl_tot, 0.00)::numeric(12,2),
          'count', coalesce(sub.incl_cnt, 0)
        ),
        'none', jsonb_build_object(
          'taxable', coalesce(sub.none_taxable, 0.00)::numeric(12,2),
          'vat', 0.00,
          'total', coalesce(sub.none_tot, 0.00)::numeric(12,2),
          'count', coalesce(sub.none_cnt, 0)
        )
      )
    ) order by m.month_num asc
  ), '[]'::jsonb)
  into v_rows
  from generate_series(1, 12) as m(month_num)
  left join (
    select
      extract(month from timezone('Asia/Dubai', paid_at))::int as m_num,
      sum(coalesce(taxable_amount, amount - vat_amount))::numeric(12,2) as taxable,
      sum(vat_amount)::numeric(12,2) as vat,
      sum(amount)::numeric(12,2) as tot,
      count(id) as cnt,
      sum(case when vat_treatment = 'exclusive' then coalesce(taxable_amount, amount - vat_amount) else 0 end)::numeric(12,2) as excl_taxable,
      sum(case when vat_treatment = 'exclusive' then vat_amount else 0 end)::numeric(12,2) as excl_vat,
      sum(case when vat_treatment = 'exclusive' then amount else 0 end)::numeric(12,2) as excl_tot,
      count(id) filter (where vat_treatment = 'exclusive') as excl_cnt,
      sum(case when vat_treatment = 'inclusive' then coalesce(taxable_amount, amount - vat_amount) else 0 end)::numeric(12,2) as incl_taxable,
      sum(case when vat_treatment = 'inclusive' then vat_amount else 0 end)::numeric(12,2) as incl_vat,
      sum(case when vat_treatment = 'inclusive' then amount else 0 end)::numeric(12,2) as incl_tot,
      count(id) filter (where vat_treatment = 'inclusive') as incl_cnt,
      sum(case when vat_treatment = 'none' then amount else 0 end)::numeric(12,2) as none_taxable,
      sum(case when vat_treatment = 'none' then amount else 0 end)::numeric(12,2) as none_tot,
      count(id) filter (where vat_treatment = 'none') as none_cnt
    from public.payments
    where status = 'valid'
      and extract(year from timezone('Asia/Dubai', paid_at))::int = v_year
    group by extract(month from timezone('Asia/Dubai', paid_at))::int
  ) sub on sub.m_num = m.month_num;

  select jsonb_build_object(
    'year', v_year,
    'vat_enabled', coalesce(v_vat_enabled, false),
    'total_taxable', coalesce(sum(coalesce(taxable_amount, amount - vat_amount)), 0.00)::numeric(12,2),
    'total_vat', coalesce(sum(vat_amount), 0.00)::numeric(12,2),
    'total_collected', coalesce(sum(amount), 0.00)::numeric(12,2),
    'total_receipts', count(id),
    'by_treatment', jsonb_build_object(
      'exclusive', jsonb_build_object(
        'taxable', coalesce(sum(case when vat_treatment = 'exclusive' then coalesce(taxable_amount, amount - vat_amount) else 0 end), 0.00)::numeric(12,2),
        'vat', coalesce(sum(case when vat_treatment = 'exclusive' then vat_amount else 0 end), 0.00)::numeric(12,2),
        'total', coalesce(sum(case when vat_treatment = 'exclusive' then amount else 0 end), 0.00)::numeric(12,2),
        'count', count(id) filter (where vat_treatment = 'exclusive')
      ),
      'inclusive', jsonb_build_object(
        'taxable', coalesce(sum(case when vat_treatment = 'inclusive' then coalesce(taxable_amount, amount - vat_amount) else 0 end), 0.00)::numeric(12,2),
        'vat', coalesce(sum(case when vat_treatment = 'inclusive' then vat_amount else 0 end), 0.00)::numeric(12,2),
        'total', coalesce(sum(case when vat_treatment = 'inclusive' then amount else 0 end), 0.00)::numeric(12,2),
        'count', count(id) filter (where vat_treatment = 'inclusive')
      ),
      'none', jsonb_build_object(
        'taxable', coalesce(sum(case when vat_treatment = 'none' then amount else 0 end), 0.00)::numeric(12,2),
        'vat', 0.00,
        'total', coalesce(sum(case when vat_treatment = 'none' then amount else 0 end), 0.00)::numeric(12,2),
        'count', count(id) filter (where vat_treatment = 'none')
      )
    )
  )
  into v_totals
  from public.payments
  where status = 'valid'
    and extract(year from timezone('Asia/Dubai', paid_at))::int = v_year;

  return jsonb_build_object(
    'year', v_year,
    'vat_enabled', coalesce(v_vat_enabled, false),
    'rows', v_rows,
    'totals', v_totals
  );
end;
$$;

revoke all on function public.report_vat_summary(int) from public, anon;
grant execute on function public.report_vat_summary(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Rewrite report_collections with taxable and vat columns
-- -----------------------------------------------------------------------------
create or replace function public.report_collections(
  p_from timestamptz,
  p_to timestamptz,
  p_staff_id uuid default null,
  p_mode text default null,
  p_purpose text default null,
  p_university_id uuid default null,
  p_course_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_effective_staff_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_totals jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_caller_id;

  if v_caller_role in ('super_admin', 'owner') then
    v_effective_staff_id := p_staff_id;
  elsif v_caller_role = 'admin' then
    if p_staff_id is not null then
      if not (p_staff_id in (select * from public.visible_user_ids())) then
        raise exception 'You can only view data within your team scope.';
      end if;
      v_effective_staff_id := p_staff_id;
    else
      v_effective_staff_id := null;
    end if;
  else
    v_effective_staff_id := v_caller_id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'receipt_no', p.receipt_no,
      'paid_at', p.paid_at,
      'amount', p.amount,
      'taxable_amount', coalesce(p.taxable_amount, p.amount - coalesce(p.vat_amount, 0))::numeric(12,2),
      'vat_amount', coalesce(p.vat_amount, 0.00)::numeric(12,2),
      'vat_treatment', coalesce(p.vat_treatment, 'inclusive'),
      'mode', p.mode,
      'purpose', p.purpose,
      'student_name', s.full_name,
      'student_code', s.student_code,
      'university_name', u.name,
      'course_name', c.name,
      'intake', e.intake,
      'received_by_name', pr.full_name,
      'share_token', p.share_token
    ) order by p.paid_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.payments p
  join public.students s on s.id = p.student_id
  join public.enrollments e on e.id = p.enrollment_id
  join public.universities u on u.id = e.university_id
  join public.courses c on c.id = e.course_id
  left join public.profiles pr on pr.id = p.received_by
  where p.status = 'valid'
    and p.paid_at >= p_from
    and p.paid_at <= p_to
    and (
      case
        when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
        else p.received_by in (select * from public.visible_user_ids())
      end
    )
    and (p_mode is null or p.mode::text = p_mode)
    and (p_purpose is null or p.purpose::text = p_purpose)
    and (p_university_id is null or e.university_id = p_university_id)
    and (p_course_id is null or e.course_id = p_course_id);

  select jsonb_build_object(
    'total_amount', coalesce(sum(p.amount), 0.00)::numeric(12,2),
    'total_taxable', coalesce(sum(coalesce(p.taxable_amount, p.amount - coalesce(p.vat_amount, 0))), 0.00)::numeric(12,2),
    'total_vat', coalesce(sum(p.vat_amount), 0.00)::numeric(12,2),
    'count', count(p.id)
  )
  into v_totals
  from public.payments p
  join public.enrollments e on e.id = p.enrollment_id
  where p.status = 'valid'
    and p.paid_at >= p_from
    and p.paid_at <= p_to
    and (
      case
        when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
        else p.received_by in (select * from public.visible_user_ids())
      end
    )
    and (p_mode is null or p.mode::text = p_mode)
    and (p_purpose is null or p.purpose::text = p_purpose)
    and (p_university_id is null or e.university_id = p_university_id)
    and (p_course_id is null or e.course_id = p_course_id);

  return jsonb_build_object(
    'rows', v_rows,
    'totals', v_totals
  );
end;
$$;

revoke all on function public.report_collections(timestamptz, timestamptz, uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.report_collections(timestamptz, timestamptz, uuid, text, text, uuid, uuid) to authenticated;
