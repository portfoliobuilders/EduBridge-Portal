-- =============================================================================
-- Migration: 0007_admin_features.sql
-- Description: Company settings message templates, branding storage bucket,
--              atomic bulk programs import RPC, and staff summary RPC.
-- =============================================================================

-- 1. Add message templates to company_settings
alter table public.company_settings
  add column if not exists whatsapp_receipt_template text not null default 'Dear {student_name}, thank you for your payment of AED {amount} to EduBridge Education. Receipt No: {receipt_no}. Balance: AED {balance}. View/download: {public_link}',
  add column if not exists whatsapp_statement_template text not null default 'Dear {student_name}, your balance due with EduBridge Education is AED {balance}. Statement: {public_link}',
  add column if not exists email_subject_template text not null default 'Payment Receipt {receipt_no} - EduBridge Education',
  add column if not exists email_body_template text not null default 'Dear {student_name},

Thank you for your payment of AED {amount} to EduBridge Education.

Receipt No: {receipt_no}
Balance: AED {balance}
View or download your official receipt voucher here: {public_link}

Keep your receipt vouchers for future references.

EduBridge Education
Dubai, UAE';

-- 2. Setup storage bucket for branding
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  false,
  1048576, -- 1MB limit
  array['image/png', 'image/svg+xml']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png', 'image/svg+xml'];

-- Storage RLS on storage.objects for branding bucket
-- Active users can view (read) branding assets
drop policy if exists "branding_view_active_users" on storage.objects;
create policy "branding_view_active_users"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'branding' and public.is_active_user());

-- Only owners can insert/update/delete branding assets
drop policy if exists "branding_modify_owners" on storage.objects;
create policy "branding_modify_owners"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'branding' and public.is_owner())
  with check (bucket_id = 'branding' and public.is_owner());

-- 3. Atomic bulk programs import function
create or replace function public.import_programs(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_row jsonb;
  v_uni_name text;
  v_country text;
  v_course_name text;
  v_level text;
  v_duration text;
  v_course_fee numeric(12,2);
  v_spec_name text;
  v_spec_fee numeric(12,2);

  v_uni_id uuid;
  v_course_id uuid;
  v_spec_id uuid;

  v_created_unis int := 0;
  v_created_courses int := 0;
  v_created_specs int := 0;
  v_skipped int := 0;

  v_uni_is_new boolean;
  v_course_is_new boolean;
  v_spec_is_new boolean;
begin
  -- Enforce owner permission
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_owner() then
    raise exception 'Unauthorized: only owners can bulk import programs';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) != 'array' then
    raise exception 'Input must be a JSON array of program rows';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'Cannot import an empty list';
  end if;

  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import exceeds maximum limit of 2,000 rows';
  end if;

  -- Process rows in one single transaction
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_uni_name := trim(v_row->>'university');
    v_country := coalesce(nullif(trim(v_row->>'country'), ''), 'UAE');
    v_course_name := trim(v_row->>'course');
    v_level := coalesce(nullif(trim(v_row->>'level'), ''), 'Other');
    v_duration := nullif(trim(v_row->>'duration'), '');
    
    if nullif(trim(v_row->>'course_default_fee'), '') is not null then
      v_course_fee := (v_row->>'course_default_fee')::numeric(12,2);
      if v_course_fee < 0 then
        raise exception 'Course fee cannot be negative for %', v_course_name;
      end if;
    else
      v_course_fee := null;
    end if;

    v_spec_name := nullif(trim(v_row->>'specialization'), '');
    if nullif(trim(v_row->>'specialization_default_fee'), '') is not null then
      v_spec_fee := (v_row->>'specialization_default_fee')::numeric(12,2);
      if v_spec_fee < 0 then
        raise exception 'Specialization fee cannot be negative for %', v_spec_name;
      end if;
    else
      v_spec_fee := null;
    end if;

    if v_uni_name is null or v_uni_name = '' then
      raise exception 'University name is required in row';
    end if;

    if v_course_name is null or v_course_name = '' then
      raise exception 'Course name is required in row';
    end if;

    v_uni_is_new := false;
    v_course_is_new := false;
    v_spec_is_new := false;

    -- 1. University find or create
    select id into v_uni_id
    from universities
    where lower(name) = lower(v_uni_name);

    if not found then
      insert into universities (name, country, is_active)
      values (v_uni_name, v_country, true)
      returning id into v_uni_id;
      v_created_unis := v_created_unis + 1;
      v_uni_is_new := true;
    end if;

    -- 2. Course find or create
    select id into v_course_id
    from courses
    where university_id = v_uni_id and lower(name) = lower(v_course_name);

    if not found then
      insert into courses (university_id, name, level, duration, default_fee, is_active)
      values (v_uni_id, v_course_name, v_level, v_duration, v_course_fee, true)
      returning id into v_course_id;
      v_created_courses := v_created_courses + 1;
      v_course_is_new := true;
    end if;

    -- 3. Specialization find or create (if specified)
    if v_spec_name is not null then
      select id into v_spec_id
      from specializations
      where course_id = v_course_id and lower(name) = lower(v_spec_name);

      if not found then
        insert into specializations (course_id, name, default_fee, is_active)
        values (v_course_id, v_spec_name, v_spec_fee, true)
        returning id into v_spec_id;
        v_created_specs := v_created_specs + 1;
        v_spec_is_new := true;
      else
        -- Specialization already exists
        if not v_uni_is_new and not v_course_is_new then
          v_skipped := v_skipped + 1;
        end if;
      end if;
    else
      -- No specialization in this row; if university and course already existed, count as skipped
      if not v_uni_is_new and not v_course_is_new then
        v_skipped := v_skipped + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'created_universities', v_created_unis,
    'created_courses', v_created_courses,
    'created_specializations', v_created_specs,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.import_programs(jsonb) from public;
grant execute on function public.import_programs(jsonb) to authenticated;

-- 4. Staff list RPC (returns full profiles with email, last sign-in, and monthly collections)
create or replace function public.get_staff_list()
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  role app_role,
  is_active boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  collections_this_month numeric(12,2)
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid;
  v_start_of_month timestamptz;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null or not public.is_owner() then
    raise exception 'Unauthorized: only owners can view staff list';
  end if;

  v_start_of_month := date_trunc('month', (now() at time zone 'Asia/Dubai')) at time zone 'Asia/Dubai';

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    p.role,
    p.is_active,
    u.last_sign_in_at,
    p.created_at,
    coalesce(
      (
        select sum(pay.amount)
        from public.payments pay
        where pay.received_by = p.id
          and pay.status = 'valid'
          and pay.paid_at >= v_start_of_month
      ),
      0
    )::numeric(12,2) as collections_this_month
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.get_staff_list() from public;
grant execute on function public.get_staff_list() to authenticated;
