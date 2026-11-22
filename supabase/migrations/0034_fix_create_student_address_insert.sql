-- Migration 0034: Fix create_student_with_enrollment student_addresses insertion
-- In migration 0033, create_student_with_enrollment mistakenly targeted billing_address and shipping_address
-- as columns on public.students instead of inserting into public.student_addresses.

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

  -- Insert Student (without billing_address/shipping_address columns)
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
    guardian_email
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
    nullif(trim(p_guardian_email), '')
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

  -- Insert student_addresses if provided
  if p_billing_address is not null and (p_billing_address->>'line1') is not null and trim(p_billing_address->>'line1') != '' then
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

  if p_shipping_address is not null and (p_shipping_address->>'line1') is not null and trim(p_shipping_address->>'line1') != '' then
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
