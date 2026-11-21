-- =============================================================================
-- Migration: 0012_fix_record_payment_counter_col.sql
-- Fixes receipt_counters column name (last_no) and maintains student_id snapshot
-- and opening_paid balance enforcement in record_payment RPC.
-- =============================================================================

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
