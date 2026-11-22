-- Migration 0035: Update get_public_receipt and get_public_statement with VAT treatment fields

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
    'taxable_amount', p.taxable_amount,
    'vat_treatment', p.vat_treatment,
    'vat_rate', p.vat_rate,
    'no_vat_reason', e.no_vat_reason,
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
        'footer_note', cs.footer_note,
        'vat_enabled', cs.vat_enabled,
        'default_vat_treatment', cs.default_vat_treatment
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
  left join profiles adm on adm.id = e.admission_staff_id
  where p.share_token = p_token
    and p.share_enabled = true;

  return v_res;
end;
$$;

revoke all on function public.get_public_receipt(uuid) from public;
grant execute on function public.get_public_receipt(uuid) to anon, authenticated;

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
    'vat_treatment', e.vat_treatment,
    'vat_rate', e.vat_rate,
    'no_vat_reason', e.no_vat_reason,
    'status', e.status,
    'student_name', s.full_name,
    'student_code', s.student_code,
    'course_name', c.name,
    'specialization_name', sp.name,
    'university_name', u.name,
    'net_fee', l.net_fee,
    'taxable', l.taxable,
    'vat_total', l.vat_total,
    'vat_amount', l.vat_total,
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
          'status', p.status,
          'vat_amount', p.vat_amount,
          'taxable_amount', p.taxable_amount,
          'vat_treatment', p.vat_treatment
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
        'footer_note', cs.footer_note,
        'vat_enabled', cs.vat_enabled,
        'default_vat_treatment', cs.default_vat_treatment
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
