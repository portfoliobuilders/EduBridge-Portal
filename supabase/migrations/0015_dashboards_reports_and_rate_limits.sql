-- =============================================================================
-- Migration: 0015_dashboards_reports_and_rate_limits.sql
-- Description:
--   1. Public rate limits table + hit_rate_limit SECURITY DEFINER RPC.
--   2. Rotate & toggle receipt share token alias RPCs.
--   3. Performance indexes on payments and enrollments.
--   4. Dashboard & Reporting RPCs with SQL-enforced staff isolation:
--      - dashboard_kpis(from, to, staff_id)
--      - report_collections(...)
--      - report_outstanding(...)
--      - report_dayend(...)
--      - report_voids(...)
--      - report_vat_summary(...)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Public Rate Limiting in Postgres (keyed by IP / route)
-- -----------------------------------------------------------------------------
create table if not exists public.public_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);

alter table public.public_rate_limits enable row level security;
revoke all on public.public_rate_limits from anon, authenticated, public;

create or replace function public.hit_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  -- Bucket window into fixed window of p_window_seconds
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  -- Upsert hit
  insert into public.public_rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.public_rate_limits.count + 1
  returning count into v_count;

  -- Opportunistically clean up entries older than 1 day
  delete from public.public_rate_limits
  where window_start < (now() - interval '1 day');

  -- Returns true if rate limit is exceeded (> p_limit)
  return (v_count > p_limit);
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public;
grant execute on function public.hit_rate_limit(text, int, int) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Rotate & Toggle Receipt Share Token RPCs
-- -----------------------------------------------------------------------------
create or replace function public.rotate_receipt_share_token(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.rotate_share_token(p_payment_id);
end;
$$;

revoke all on function public.rotate_receipt_share_token(uuid) from public, anon;
grant execute on function public.rotate_receipt_share_token(uuid) to authenticated;

create or replace function public.toggle_receipt_share_enabled(
  p_payment_id uuid,
  p_enabled boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curr boolean;
  v_new boolean;
begin
  if p_enabled is not null then
    return public.set_payment_share_enabled(p_payment_id, p_enabled);
  end if;

  select share_enabled into v_curr from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  v_new := not coalesce(v_curr, false);
  return public.set_payment_share_enabled(p_payment_id, v_new);
end;
$$;

revoke all on function public.toggle_receipt_share_enabled(uuid, boolean) from public, anon;
grant execute on function public.toggle_receipt_share_enabled(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Performance Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_payments_paid_at on public.payments(paid_at);
create index if not exists idx_payments_received_by_paid_at on public.payments(received_by, paid_at);
create index if not exists idx_payments_enrollment_id on public.payments(enrollment_id);
create index if not exists idx_enrollments_admission_staff_id on public.enrollments(admission_staff_id);

-- -----------------------------------------------------------------------------
-- 4. Dashboard KPIs RPC (Strict SQL Staff Scoping)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_kpis(
  p_from timestamptz,
  p_to timestamptz,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_effective_staff_id uuid;
  v_is_owner boolean;
  v_total_collected numeric(12,2) := 0;
  v_receipts_count int := 0;
  v_new_admissions int := 0;
  v_total_outstanding numeric(12,2) := 0;
  v_voided_count int := 0;
  v_by_mode jsonb := '[]'::jsonb;
  v_by_day jsonb := '[]'::jsonb;
  v_by_staff jsonb := '[]'::jsonb;
  v_top_unis jsonb := '[]'::jsonb;
  v_top_courses jsonb := '[]'::jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  v_is_owner := public.is_owner();
  -- Enforce in SQL: if caller is not owner, force to caller's id regardless of input
  if not v_is_owner then
    v_effective_staff_id := v_caller_id;
  else
    v_effective_staff_id := p_staff_id;
  end if;

  -- 1. Total collected & receipts count (exclude void payments)
  select
    coalesce(sum(amount), 0.00),
    count(id)
  into v_total_collected, v_receipts_count
  from public.payments
  where status = 'valid'
    and paid_at >= p_from
    and paid_at <= p_to
    and (v_effective_staff_id is null or received_by = v_effective_staff_id);

  -- 2. Voided receipts count in period
  select count(id)
  into v_voided_count
  from public.payments
  where status = 'void'
    and paid_at >= p_from
    and paid_at <= p_to
    and (v_effective_staff_id is null or received_by = v_effective_staff_id);

  -- 3. New admissions created in period
  select count(id)
  into v_new_admissions
  from public.enrollments
  where created_at >= p_from
    and created_at <= p_to
    and (v_effective_staff_id is null or admission_staff_id = v_effective_staff_id);

  -- 4. Outstanding balance across active enrollments
  -- opening_paid counts toward balance, but NOT toward collections in period
  select coalesce(sum(l.balance), 0.00)
  into v_total_outstanding
  from public.enrollment_ledger l
  join public.enrollments e on e.id = l.enrollment_id
  where e.status = 'active'
    and l.balance > 0
    and (v_effective_staff_id is null or e.admission_staff_id = v_effective_staff_id);

  -- 5. Collections by payment mode
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'mode', sub.mode,
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.total desc
  ), '[]'::jsonb)
  into v_by_mode
  from (
    select
      mode::text,
      sum(amount)::numeric(12,2) as total,
      count(id) as cnt
    from public.payments
    where status = 'valid'
      and paid_at >= p_from
      and paid_at <= p_to
      and (v_effective_staff_id is null or received_by = v_effective_staff_id)
    group by mode
  ) sub;

  -- 6. Collections per day (grouped in Asia/Dubai timezone)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(sub.dubai_date, 'YYYY-MM-DD'),
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.dubai_date asc
  ), '[]'::jsonb)
  into v_by_day
  from (
    select
      timezone('Asia/Dubai', paid_at)::date as dubai_date,
      sum(amount)::numeric(12,2) as total,
      count(id) as cnt
    from public.payments
    where status = 'valid'
      and paid_at >= p_from
      and paid_at <= p_to
      and (v_effective_staff_id is null or received_by = v_effective_staff_id)
    group by timezone('Asia/Dubai', paid_at)::date
  ) sub;

  -- 7. Staff Leaderboard (only for owner, or self if staff)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'staff_id', sub.staff_id,
      'staff_name', sub.staff_name,
      'admissions', sub.admissions,
      'collected', sub.collected,
      'receipts_count', sub.receipts_count,
      'avg_receipt', sub.avg_receipt,
      'outstanding', sub.outstanding
    ) order by sub.collected desc
  ), '[]'::jsonb)
  into v_by_staff
  from (
    select
      pr.id as staff_id,
      pr.full_name as staff_name,
      coalesce(adm.cnt, 0) as admissions,
      coalesce(coll.tot, 0.00)::numeric(12,2) as collected,
      coalesce(coll.cnt, 0) as receipts_count,
      case
        when coalesce(coll.cnt, 0) > 0 then round(coalesce(coll.tot, 0.00) / coll.cnt, 2)
        else 0.00
      end as avg_receipt,
      coalesce(outst.bal, 0.00)::numeric(12,2) as outstanding
    from public.profiles pr
    left join (
      select admission_staff_id, count(id) as cnt
      from public.enrollments
      where created_at >= p_from and created_at <= p_to
      group by admission_staff_id
    ) adm on adm.admission_staff_id = pr.id
    left join (
      select received_by, sum(amount) as tot, count(id) as cnt
      from public.payments
      where status = 'valid' and paid_at >= p_from and paid_at <= p_to
      group by received_by
    ) coll on coll.received_by = pr.id
    left join (
      select e.admission_staff_id, sum(l.balance) as bal
      from public.enrollments e
      join public.enrollment_ledger l on l.enrollment_id = e.id
      where e.status = 'active' and l.balance > 0
      group by e.admission_staff_id
    ) outst on outst.admission_staff_id = pr.id
    where pr.is_active = true
      and (v_effective_staff_id is null or pr.id = v_effective_staff_id)
  ) sub;

  -- 8. Top universities by collection
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'university_id', sub.uni_id,
      'university_name', sub.uni_name,
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.total desc
  ), '[]'::jsonb)
  into v_top_unis
  from (
    select
      u.id as uni_id,
      u.name as uni_name,
      sum(p.amount)::numeric(12,2) as total,
      count(p.id) as cnt
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    join public.universities u on u.id = e.university_id
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and (v_effective_staff_id is null or p.received_by = v_effective_staff_id)
    group by u.id, u.name
    limit 10
  ) sub;

  -- 9. Top courses by collection
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'course_id', sub.c_id,
      'course_name', sub.c_name,
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.total desc
  ), '[]'::jsonb)
  into v_top_courses
  from (
    select
      c.id as c_id,
      c.name as c_name,
      sum(p.amount)::numeric(12,2) as total,
      count(p.id) as cnt
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    join public.courses c on c.id = e.course_id
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and (v_effective_staff_id is null or p.received_by = v_effective_staff_id)
    group by c.id, c.name
    limit 10
  ) sub;

  return jsonb_build_object(
    'total_collected', v_total_collected,
    'receipts_count', v_receipts_count,
    'new_admissions', v_new_admissions,
    'total_outstanding', v_total_outstanding,
    'voided_count', v_voided_count,
    'by_mode', v_by_mode,
    'by_day', v_by_day,
    'by_staff', v_by_staff,
    'top_universities', v_top_unis,
    'top_courses', v_top_courses
  );
end;
$$;

revoke all on function public.dashboard_kpis(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.dashboard_kpis(timestamptz, timestamptz, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Collections Report RPC
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
  v_effective_staff_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_totals jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if not public.is_owner() then
    v_effective_staff_id := v_caller_id;
  else
    v_effective_staff_id := p_staff_id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'receipt_no', p.receipt_no,
      'paid_at', p.paid_at,
      'student_id', s.id,
      'student_name', s.full_name,
      'student_code', s.student_code,
      'amount', p.amount,
      'mode', p.mode,
      'purpose', p.purpose,
      'purpose_note', p.purpose_note,
      'reference_no', p.reference_no,
      'received_by_name', pr.full_name,
      'received_by_id', p.received_by,
      'university_name', u.name,
      'course_name', c.name,
      'vat_amount', p.vat_amount,
      'status', p.status
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
    and (v_effective_staff_id is null or p.received_by = v_effective_staff_id)
    and (p_mode is null or p.mode::text = p_mode)
    and (p_purpose is null or p.purpose::text = p_purpose)
    and (p_university_id is null or e.university_id = p_university_id)
    and (p_course_id is null or e.course_id = p_course_id);

  select jsonb_build_object(
    'total_amount', coalesce(sum(p.amount), 0.00),
    'total_vat', coalesce(sum(p.vat_amount), 0.00),
    'count', count(p.id)
  )
  into v_totals
  from public.payments p
  join public.enrollments e on e.id = p.enrollment_id
  where p.status = 'valid'
    and p.paid_at >= p_from
    and p.paid_at <= p_to
    and (v_effective_staff_id is null or p.received_by = v_effective_staff_id)
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

-- -----------------------------------------------------------------------------
-- 6. Outstanding Balances Report RPC
-- -----------------------------------------------------------------------------
create or replace function public.report_outstanding(
  p_staff_id uuid default null,
  p_university_id uuid default null,
  p_course_id uuid default null,
  p_min_balance numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_effective_staff_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_totals jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if not public.is_owner() then
    v_effective_staff_id := v_caller_id;
  else
    v_effective_staff_id := p_staff_id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'enrollment_id', e.id,
      'student_id', s.id,
      'student_name', s.full_name,
      'student_code', s.student_code,
      'mobile', s.mobile,
      'email', s.email,
      'admission_staff_name', pr.full_name,
      'admission_staff_id', e.admission_staff_id,
      'university_name', u.name,
      'course_name', c.name,
      'intake', e.intake,
      'total_payable', l.total_payable,
      'total_paid', l.total_paid,
      'balance', l.balance,
      'opening_paid', coalesce(e.opening_paid, 0),
      'last_payment_at', l.last_payment_at,
      'days_since_last_payment', coalesce(
        extract(day from (now() - l.last_payment_at))::int,
        extract(day from (now() - e.created_at))::int
      ),
      'share_token', e.share_token
    ) order by l.balance desc
  ), '[]'::jsonb)
  into v_rows
  from public.enrollments e
  join public.students s on s.id = e.student_id
  join public.universities u on u.id = e.university_id
  join public.courses c on c.id = e.course_id
  join public.enrollment_ledger l on l.enrollment_id = e.id
  left join public.profiles pr on pr.id = e.admission_staff_id
  where e.status = 'active'
    and l.balance > coalesce(p_min_balance, 0)
    and (v_effective_staff_id is null or e.admission_staff_id = v_effective_staff_id)
    and (p_university_id is null or e.university_id = p_university_id)
    and (p_course_id is null or e.course_id = p_course_id);

  select jsonb_build_object(
    'total_balance', coalesce(sum(l.balance), 0.00),
    'total_payable', coalesce(sum(l.total_payable), 0.00),
    'total_paid', coalesce(sum(l.total_paid), 0.00),
    'count', count(e.id)
  )
  into v_totals
  from public.enrollments e
  join public.enrollment_ledger l on l.enrollment_id = e.id
  where e.status = 'active'
    and l.balance > coalesce(p_min_balance, 0)
    and (v_effective_staff_id is null or e.admission_staff_id = v_effective_staff_id)
    and (p_university_id is null or e.university_id = p_university_id)
    and (p_course_id is null or e.course_id = p_course_id);

  return jsonb_build_object(
    'rows', v_rows,
    'totals', v_totals
  );
end;
$$;

revoke all on function public.report_outstanding(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.report_outstanding(uuid, uuid, uuid, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Day-End Cash Report RPC (Asia/Dubai Date Boundaries)
-- -----------------------------------------------------------------------------
create or replace function public.report_dayend(
  p_date date,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_effective_staff_id uuid;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_staff_summary jsonb := '[]'::jsonb;
  v_overall_totals jsonb;
  v_payments jsonb := '[]'::jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if not public.is_owner() then
    v_effective_staff_id := v_caller_id;
  else
    v_effective_staff_id := p_staff_id;
  end if;

  -- Compute exact Dubai day boundary in UTC timestamptz
  v_day_start := (p_date::text || ' 00:00:00+04')::timestamptz;
  v_day_end := (p_date::text || ' 23:59:59.999999+04')::timestamptz;

  -- 1. Summary per staff for the day
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'staff_id', sub.st_id,
      'staff_name', sub.st_name,
      'cash_total', sub.cash_tot,
      'cash_count', sub.cash_cnt,
      'non_cash_total', sub.non_cash_tot,
      'non_cash_count', sub.non_cash_cnt,
      'card_total', sub.card_tot,
      'link_total', sub.link_tot,
      'bank_transfer_total', sub.transfer_tot,
      'total_collected', sub.grand_tot,
      'total_receipts', sub.grand_cnt
    ) order by sub.grand_tot desc
  ), '[]'::jsonb)
  into v_staff_summary
  from (
    select
      pr.id as st_id,
      pr.full_name as st_name,
      coalesce(sum(case when p.mode = 'cash' then p.amount else 0 end), 0.00)::numeric(12,2) as cash_tot,
      count(case when p.mode = 'cash' then 1 end) as cash_cnt,
      coalesce(sum(case when p.mode != 'cash' then p.amount else 0 end), 0.00)::numeric(12,2) as non_cash_tot,
      count(case when p.mode != 'cash' then 1 end) as non_cash_cnt,
      coalesce(sum(case when p.mode = 'card' then p.amount else 0 end), 0.00)::numeric(12,2) as card_tot,
      coalesce(sum(case when p.mode = 'link' then p.amount else 0 end), 0.00)::numeric(12,2) as link_tot,
      coalesce(sum(case when p.mode = 'bank_transfer' then p.amount else 0 end), 0.00)::numeric(12,2) as transfer_tot,
      coalesce(sum(p.amount), 0.00)::numeric(12,2) as grand_tot,
      count(p.id) as grand_cnt
    from public.payments p
    join public.profiles pr on pr.id = p.received_by
    where p.status = 'valid'
      and p.paid_at >= v_day_start
      and p.paid_at <= v_day_end
      and (v_effective_staff_id is null or p.received_by = v_effective_staff_id)
    group by pr.id, pr.full_name
  ) sub;

  -- 2. Overall totals for closing cash count
  select jsonb_build_object(
    'cash_total', coalesce(sum(case when mode = 'cash' then amount else 0 end), 0.00)::numeric(12,2),
    'cash_count', count(case when mode = 'cash' then 1 end),
    'non_cash_total', coalesce(sum(case when mode != 'cash' then amount else 0 end), 0.00)::numeric(12,2),
    'non_cash_count', count(case when mode != 'cash' then 1 end),
    'total_collected', coalesce(sum(amount), 0.00)::numeric(12,2),
    'total_receipts', count(id)
  )
  into v_overall_totals
  from public.payments
  where status = 'valid'
    and paid_at >= v_day_start
    and paid_at <= v_day_end
    and (v_effective_staff_id is null or received_by = v_effective_staff_id);

  -- 3. Individual payments list for verification
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'receipt_no', p.receipt_no,
      'paid_at', p.paid_at,
      'student_name', s.full_name,
      'student_code', s.student_code,
      'amount', p.amount,
      'mode', p.mode,
      'received_by_name', pr.full_name
    ) order by p.paid_at desc
  ), '[]'::jsonb)
  into v_payments
  from public.payments p
  join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.received_by
  where p.status = 'valid'
    and p.paid_at >= v_day_start
    and p.paid_at <= v_day_end
    and (v_effective_staff_id is null or p.received_by = v_effective_staff_id);

  return jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'staff_summary', v_staff_summary,
    'totals', v_overall_totals,
    'payments', v_payments
  );
end;
$$;

revoke all on function public.report_dayend(date, uuid) from public, anon;
grant execute on function public.report_dayend(date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Voids Report RPC
-- -----------------------------------------------------------------------------
create or replace function public.report_voids(
  p_from timestamptz,
  p_to timestamptz,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_effective_staff_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_totals jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if not public.is_owner() then
    v_effective_staff_id := v_caller_id;
  else
    v_effective_staff_id := p_staff_id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'receipt_no', p.receipt_no,
      'paid_at', p.paid_at,
      'amount', p.amount,
      'mode', p.mode,
      'student_name', s.full_name,
      'student_code', s.student_code,
      'received_by_name', pr_rec.full_name,
      'voided_by_name', pr_void.full_name,
      'voided_at', p.voided_at,
      'void_reason', p.void_reason
    ) order by p.voided_at desc nulls last, p.paid_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.payments p
  join public.students s on s.id = p.student_id
  left join public.profiles pr_rec on pr_rec.id = p.received_by
  left join public.profiles pr_void on pr_void.id = p.voided_by
  where p.status = 'void'
    and (
      (p.voided_at is not null and p.voided_at >= p_from and p.voided_at <= p_to)
      or (p.voided_at is null and p.paid_at >= p_from and p.paid_at <= p_to)
    )
    and (v_effective_staff_id is null or p.received_by = v_effective_staff_id);

  select jsonb_build_object(
    'total_voided_amount', coalesce(sum(p.amount), 0.00),
    'count', count(p.id)
  )
  into v_totals
  from public.payments p
  where p.status = 'void'
    and (
      (p.voided_at is not null and p.voided_at >= p_from and p.voided_at <= p_to)
      or (p.voided_at is null and p.paid_at >= p_from and p.paid_at <= p_to)
    )
    and (v_effective_staff_id is null or p.received_by = v_effective_staff_id);

  return jsonb_build_object(
    'rows', v_rows,
    'totals', v_totals
  );
end;
$$;

revoke all on function public.report_voids(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.report_voids(timestamptz, timestamptz, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. VAT Summary Report RPC (Only if vat_enabled or data exists)
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
      'receipt_count', coalesce(sub.cnt, 0)
    ) order by m.month_num asc
  ), '[]'::jsonb)
  into v_rows
  from generate_series(1, 12) as m(month_num)
  left join (
    select
      extract(month from timezone('Asia/Dubai', paid_at))::int as m_num,
      sum(case when vat_type = 'exclusive' then (amount - vat_amount) else (amount - vat_amount) end)::numeric(12,2) as taxable,
      sum(vat_amount)::numeric(12,2) as vat,
      sum(amount)::numeric(12,2) as tot,
      count(id) as cnt
    from public.payments
    where status = 'valid'
      and extract(year from timezone('Asia/Dubai', paid_at))::int = v_year
    group by extract(month from timezone('Asia/Dubai', paid_at))::int
  ) sub on sub.m_num = m.month_num;

  select jsonb_build_object(
    'year', v_year,
    'vat_enabled', coalesce(v_vat_enabled, false),
    'total_taxable', coalesce(sum(amount - vat_amount), 0.00)::numeric(12,2),
    'total_vat', coalesce(sum(vat_amount), 0.00)::numeric(12,2),
    'total_collected', coalesce(sum(amount), 0.00)::numeric(12,2),
    'total_receipts', count(id)
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
