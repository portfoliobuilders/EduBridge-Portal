-- ============================================================================
-- Migration: 0028_reports_and_kpis_role_compat.sql
-- Description: Allow 'super_admin' and 'owner' in dashboard_kpis and report RPCs.
-- ============================================================================

-- 1. dashboard_kpis
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
  v_caller_role text;
  v_effective_staff_id uuid;
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

  -- 1. Total collected & receipts count
  select
    coalesce(sum(amount), 0.00),
    count(id)
  into v_total_collected, v_receipts_count
  from public.payments
  where status = 'valid'
    and paid_at >= p_from
    and paid_at <= p_to
    and (
      case
        when v_effective_staff_id is not null then received_by = v_effective_staff_id
        else received_by in (select * from public.visible_user_ids())
      end
    );

  -- 2. New admissions
  select count(distinct e.id)
  into v_new_admissions
  from public.enrollments e
  where e.created_at >= p_from
    and e.created_at <= p_to
    and (
      case
        when v_effective_staff_id is not null then e.admission_staff_id = v_effective_staff_id
        else e.admission_staff_id in (select * from public.visible_user_ids())
      end
    );

  -- 3. Total outstanding
  select coalesce(sum(l.balance), 0.00)
  into v_total_outstanding
  from public.enrollments e
  join public.enrollment_ledger l on l.enrollment_id = e.id
  where e.status = 'active'
    and l.balance > 0
    and (
      case
        when v_effective_staff_id is not null then e.admission_staff_id = v_effective_staff_id
        else e.admission_staff_id in (select * from public.visible_user_ids())
      end
    );

  -- 4. Voided count
  select count(id)
  into v_voided_count
  from public.payments
  where status = 'void'
    and (
      (voided_at is not null and voided_at >= p_from and voided_at <= p_to)
      or (voided_at is null and paid_at >= p_from and paid_at <= p_to)
    )
    and (
      case
        when v_effective_staff_id is not null then received_by = v_effective_staff_id
        else received_by in (select * from public.visible_user_ids())
      end
    );

  -- 5. By mode
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
      p.mode,
      coalesce(sum(p.amount), 0.00) as total,
      count(p.id) as cnt
    from public.payments p
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and (
        case
          when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
          else p.received_by in (select * from public.visible_user_ids())
        end
      )
    group by p.mode
  ) sub;

  -- 6. By day (Dubai timezone)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(sub.day_bucket, 'YYYY-MM-DD'),
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.day_bucket asc
  ), '[]'::jsonb)
  into v_by_day
  from (
    select
      date_trunc('day', p.paid_at at time zone 'Asia/Dubai') as day_bucket,
      coalesce(sum(p.amount), 0.00) as total,
      count(p.id) as cnt
    from public.payments p
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and (
        case
          when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
          else p.received_by in (select * from public.visible_user_ids())
        end
      )
    group by date_trunc('day', p.paid_at at time zone 'Asia/Dubai')
  ) sub;

  -- 7. Leaderboard (scoped to visible users)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'staff_id', sub.staff_id,
      'staff_name', sub.staff_name,
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.total desc
  ), '[]'::jsonb)
  into v_by_staff
  from (
    select
      p.received_by as staff_id,
      coalesce(pr.full_name, 'Unknown') as staff_name,
      coalesce(sum(p.amount), 0.00) as total,
      count(p.id) as cnt
    from public.payments p
    left join public.profiles pr on pr.id = p.received_by
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and p.received_by in (select * from public.visible_user_ids())
    group by p.received_by, pr.full_name
  ) sub;

  -- 8. Top universities
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'university_name', sub.uni_name,
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.total desc
  ), '[]'::jsonb)
  into v_top_unis
  from (
    select
      u.name as uni_name,
      coalesce(sum(p.amount), 0.00) as total,
      count(p.id) as cnt
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    join public.universities u on u.id = e.university_id
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and (
        case
          when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
          else p.received_by in (select * from public.visible_user_ids())
        end
      )
    group by u.name
    order by total desc
    limit 5
  ) sub;

  -- 9. Top courses
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'course_name', sub.crs_name,
      'total', sub.total,
      'count', sub.cnt
    ) order by sub.total desc
  ), '[]'::jsonb)
  into v_top_courses
  from (
    select
      c.name as crs_name,
      coalesce(sum(p.amount), 0.00) as total,
      count(p.id) as cnt
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    join public.courses c on c.id = e.course_id
    where p.status = 'valid'
      and p.paid_at >= p_from
      and p.paid_at <= p_to
      and (
        case
          when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
          else p.received_by in (select * from public.visible_user_ids())
        end
      )
    group by c.name
    order by total desc
    limit 5
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

-- 2. report_collections
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
    'total_amount', coalesce(sum(p.amount), 0.00),
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

-- 3. report_outstanding
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
    and (
      case
        when v_effective_staff_id is not null then e.admission_staff_id = v_effective_staff_id
        else e.admission_staff_id in (select * from public.visible_user_ids())
      end
    )
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
    and (
      case
        when v_effective_staff_id is not null then e.admission_staff_id = v_effective_staff_id
        else e.admission_staff_id in (select * from public.visible_user_ids())
      end
    )
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

-- 4. report_dayend
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
  v_caller_role text;
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

  v_day_start := (p_date::text || ' 00:00:00 Asia/Dubai')::timestamptz;
  v_day_end := (p_date::text || ' 23:59:59.999999 Asia/Dubai')::timestamptz;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'staff_id', sub.staff_id,
      'staff_name', sub.staff_name,
      'cash_total', sub.cash_total,
      'card_total', sub.card_total,
      'link_total', sub.link_total,
      'bank_total', sub.bank_total,
      'total_collected', sub.total_collected,
      'voucher_count', sub.cnt
    ) order by sub.total_collected desc
  ), '[]'::jsonb)
  into v_staff_summary
  from (
    select
      p.received_by as staff_id,
      coalesce(pr.full_name, 'Unknown') as staff_name,
      coalesce(sum(case when p.mode = 'cash' then p.amount else 0 end), 0.00) as cash_total,
      coalesce(sum(case when p.mode = 'card' then p.amount else 0 end), 0.00) as card_total,
      coalesce(sum(case when p.mode = 'link' then p.amount else 0 end), 0.00) as link_total,
      coalesce(sum(case when p.mode = 'bank_transfer' then p.amount else 0 end), 0.00) as bank_total,
      coalesce(sum(p.amount), 0.00) as total_collected,
      count(p.id) as cnt
    from public.payments p
    left join public.profiles pr on pr.id = p.received_by
    where p.status = 'valid'
      and p.paid_at >= v_day_start
      and p.paid_at <= v_day_end
      and (
        case
          when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
          else p.received_by in (select * from public.visible_user_ids())
        end
      )
    group by p.received_by, pr.full_name
  ) sub;

  select jsonb_build_object(
    'total_cash', coalesce(sum(case when p.mode = 'cash' then p.amount else 0 end), 0.00),
    'total_card', coalesce(sum(case when p.mode = 'card' then p.amount else 0 end), 0.00),
    'total_link', coalesce(sum(case when p.mode = 'link' then p.amount else 0 end), 0.00),
    'total_bank', coalesce(sum(case when p.mode = 'bank_transfer' then p.amount else 0 end), 0.00),
    'total_collected', coalesce(sum(p.amount), 0.00),
    'total_vouchers', count(p.id)
  )
  into v_overall_totals
  from public.payments p
  where p.status = 'valid'
    and p.paid_at >= v_day_start
    and p.paid_at <= v_day_end
    and (
      case
        when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
        else p.received_by in (select * from public.visible_user_ids())
      end
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'receipt_no', p.receipt_no,
      'paid_at', p.paid_at,
      'amount', p.amount,
      'mode', p.mode,
      'student_name', s.full_name,
      'student_code', s.student_code,
      'received_by_name', pr.full_name
    ) order by p.paid_at asc
  ), '[]'::jsonb)
  into v_payments
  from public.payments p
  join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.received_by
  where p.status = 'valid'
    and p.paid_at >= v_day_start
    and p.paid_at <= v_day_end
    and (
      case
        when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
        else p.received_by in (select * from public.visible_user_ids())
      end
    );

  return jsonb_build_object(
    'date', p_date,
    'staff_summary', v_staff_summary,
    'overall_totals', v_overall_totals,
    'payments', v_payments
  );
end;
$$;

revoke all on function public.report_dayend(date, uuid) from public, anon;
grant execute on function public.report_dayend(date, uuid) to authenticated;

-- 5. report_voids
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
    and (
      case
        when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
        else p.received_by in (select * from public.visible_user_ids())
      end
    );

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
    and (
      case
        when v_effective_staff_id is not null then p.received_by = v_effective_staff_id
        else p.received_by in (select * from public.visible_user_ids())
      end
    );

  return jsonb_build_object(
    'rows', v_rows,
    'totals', v_totals
  );
end;
$$;

revoke all on function public.report_voids(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.report_voids(timestamptz, timestamptz, uuid) to authenticated;
