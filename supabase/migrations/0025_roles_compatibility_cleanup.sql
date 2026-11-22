-- ============================================================================
-- Migration: 0025_roles_compatibility_cleanup.sql
-- Description: Update legacy 'owner' checks in RPCs and RLS policies to use
-- is_admin_or_above() and is_active_user() from the roles redesign.
-- ============================================================================

-- 1. validate_enrollment trigger function
create or replace function public.validate_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_payment_count int;
  v_total_paid numeric(12,2);
  v_is_admin boolean;
begin
  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id then
      raise exception 'student_id cannot be changed';
    end if;

    select count(*), coalesce(sum(amount), 0)
    into v_payment_count, v_total_paid
    from public.payments
    where enrollment_id = old.id
      and status = 'completed';

    if v_payment_count > 0 and (new.university_id is distinct from old.university_id or new.course_id is distinct from old.course_id) then
      raise exception 'Cannot change university or course after payments have been recorded';
    end if;

    if (new.total_fee - new.discount) < v_total_paid then
      raise exception 'Net fee (AED %) cannot be reduced below total already paid (AED %)',
        (new.total_fee - new.discount), v_total_paid;
    end if;

    -- Opening paid restriction: once payments exist, only admin or above can modify opening_paid
    if (new.opening_paid is distinct from old.opening_paid) and v_payment_count > 0 then
      select public.is_admin_or_above() into v_is_admin;
      if not coalesce(v_is_admin, false) then
        raise exception 'forbidden: only admin or super_admin can change opening paid after payments exist';
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

-- 2. add_student_enrollment RPC
create or replace function public.add_student_enrollment(
  p_student_id uuid,
  p_university_id uuid,
  p_course_id uuid,
  p_specialization_id uuid default null,
  p_total_fee numeric default null,
  p_discount numeric default 0,
  p_intake text default null,
  p_admission_staff_id uuid default null
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
    created_by
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
    v_uid
  )
  returning id into v_enrollment_id;

  return jsonb_build_object(
    'enrollment_id', v_enrollment_id,
    'student_id', p_student_id
  );
end;
$$;

revoke execute on function public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.add_student_enrollment(uuid, uuid, uuid, uuid, numeric, numeric, text, uuid) to authenticated;

-- 3. create_student_with_enrollment RPC
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
  v_is_admin boolean;
  v_student_id uuid;
  v_student_code text;
  v_enrollment_id uuid;
  v_admission_staff_id uuid;
  v_clean_mobile text;
  v_clean_whatsapp text;
  v_existing_code text;
  v_opening_paid numeric := coalesce(p_opening_paid, 0);
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

  if (p_total_fee - coalesce(p_discount, 0)) < v_opening_paid then
    raise exception 'Net fee (AED %) cannot be less than opening paid (AED %)',
      (p_total_fee - coalesce(p_discount, 0)), v_opening_paid;
  end if;

  if p_vat_type not in ('inclusive', 'exclusive', 'none') then
    raise exception 'Invalid VAT type: %', p_vat_type;
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

-- 4. archive_candidate_document RPC
create or replace function public.archive_candidate_document(
  p_document_id uuid
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_doc public.candidate_documents;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if public.is_admin_or_above() then
    v_is_authorized := true;
  else
    select exists (
      select 1 from public.candidate_documents cd
      join public.students s on s.id = cd.student_id
      left join public.enrollments e on e.student_id = s.id
      where cd.id = p_document_id
        and (s.created_by = v_user_id or e.admission_staff_id = v_user_id)
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: only Super Admins, Admins, or assigned admission staff can archive documents';
  end if;

  update public.candidate_documents
  set archived_at = now()
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  -- Log action in document_access_log
  insert into public.document_access_log (document_id, actor, action)
  values (p_document_id, v_user_id::text, 'archive');

  -- Log action in audit_log
  insert into public.audit_log (action, table_name, record_id, row_id, user_id, actor, details, diff)
  values (
    'archive_candidate_document',
    'candidate_documents',
    p_document_id,
    p_document_id,
    v_user_id,
    v_user_id,
    jsonb_build_object('archived_at', now(), 'student_id', v_doc.student_id),
    jsonb_build_object('archived_at', now(), 'student_id', v_doc.student_id)
  );

  return v_doc;
end;
$$;

revoke all on function public.archive_candidate_document(uuid) from public, anon;
grant execute on function public.archive_candidate_document(uuid) to authenticated;

-- 5. revoke_document_upload_link RPC
create or replace function public.revoke_document_upload_link(
  p_link_id uuid
)
returns public.document_upload_links
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_link public.document_upload_links;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if public.is_admin_or_above() then
    v_is_authorized := true;
  else
    select (created_by = v_user_id) into v_is_authorized
    from public.document_upload_links where id = p_link_id;
  end if;

  if not v_is_authorized then
    raise exception 'forbidden: only Super Admins, Admins, or link creator can revoke this link';
  end if;

  update public.document_upload_links
  set revoked_at = now()
  where id = p_link_id
  returning * into v_link;

  if not found then
    raise exception 'link not found';
  end if;

  return v_link;
end;
$$;

revoke all on function public.revoke_document_upload_link(uuid) from public, anon;
grant execute on function public.revoke_document_upload_link(uuid) to authenticated;

-- 6. get_link_documents_stats RPC
create or replace function public.get_link_documents_stats(
  p_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_total_received int;
  v_unverified int;
  v_active_links int;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if public.is_admin_or_above() then
    select count(*) into v_total_received
    from public.candidate_documents
    where uploaded_via = 'candidate_link'
      and created_at >= v_since
      and archived_at is null;

    select count(*) into v_unverified
    from public.candidate_documents
    where uploaded_via = 'candidate_link'
      and status = 'received'
      and created_at >= v_since
      and archived_at is null;

    select count(*) into v_active_links
    from public.document_upload_links
    where expires_at > now()
      and revoked_at is null;
  else
    select count(*) into v_total_received
    from public.candidate_documents cd
    join public.students s on s.id = cd.student_id
    left join public.enrollments e on e.student_id = s.id
    where cd.uploaded_via = 'candidate_link'
      and cd.created_at >= v_since
      and cd.archived_at is null
      and (s.created_by = v_user_id or e.admission_staff_id = v_user_id);

    select count(*) into v_unverified
    from public.candidate_documents cd
    join public.students s on s.id = cd.student_id
    left join public.enrollments e on e.student_id = s.id
    where cd.uploaded_via = 'candidate_link'
      and cd.status = 'received'
      and cd.created_at >= v_since
      and cd.archived_at is null
      and (s.created_by = v_user_id or e.admission_staff_id = v_user_id);

    select count(*) into v_active_links
    from public.document_upload_links
    where expires_at > now()
      and revoked_at is null
      and created_by = v_user_id;
  end if;

  return jsonb_build_object(
    'total_received', coalesce(v_total_received, 0),
    'unverified', coalesce(v_unverified, 0),
    'active_links', coalesce(v_active_links, 0)
  );
end;
$$;

revoke all on function public.get_link_documents_stats(int) from public, anon;
grant execute on function public.get_link_documents_stats(int) to authenticated;

-- 7. Update Candidate Documents RLS Policies for Super Admin and Admin
drop policy if exists "Authenticated users can view active document types" on public.document_types;
create policy "Authenticated users can view active document types"
  on public.document_types for select
  to authenticated
  using (is_active = true or public.is_admin_or_above());

drop policy if exists "Owners can manage document types" on public.document_types;
drop policy if exists "Admins and Super Admins can manage document types" on public.document_types;
create policy "Admins and Super Admins can manage document types"
  on public.document_types for all
  to authenticated
  using (public.is_admin_or_above())
  with check (public.is_admin_or_above());

drop policy if exists "Owner or student creator can update verification/archive status" on public.candidate_documents;
create policy "Owner or student creator can update verification/archive status"
  on public.candidate_documents for update
  to authenticated
  using (
    public.is_admin_or_above()
    or exists (
      select 1 from public.students s
      where s.id = candidate_documents.student_id
        and s.created_by = auth.uid()
    )
  )
  with check (
    public.is_admin_or_above()
    or exists (
      select 1 from public.students s
      where s.id = candidate_documents.student_id
        and s.created_by = auth.uid()
    )
  );

drop policy if exists "Owner or creator can update upload links" on public.document_upload_links;
create policy "Owner or creator can update upload links"
  on public.document_upload_links for update
  to authenticated
  using (
    public.is_admin_or_above()
    or created_by = auth.uid()
  )
  with check (
    public.is_admin_or_above()
    or created_by = auth.uid()
  );
