-- ============================================================================
-- Migration: 0021_roles_redesign.sql
-- Description: Roles Redesign (super_admin, admin, staff), job titles,
-- teams/hierarchy, support account flag & settings, and scoped permissions.
-- ============================================================================

-- 1. Add new columns to profiles & company_settings
-- ============================================================================
alter table public.profiles
  add column if not exists job_title text,
  add column if not exists reports_to uuid references public.profiles(id) on delete set null,
  add column if not exists admin_scope text not null default 'team'
    check (admin_scope in ('team', 'company')),
  add column if not exists is_support boolean not null default false;

alter table public.company_settings
  add column if not exists admins_can_void boolean not null default false,
  add column if not exists support_access_enabled boolean not null default false;

-- Drop old owner guard trigger before migrating roles
drop trigger if exists trg_guard_profile_updates on public.profiles;
drop trigger if exists trg_last_owner_guard on public.profiles;

-- Migrate existing owner profiles to super_admin
update public.profiles set role = 'super_admin' where role = 'owner';

-- 2. Helper Functions (SECURITY DEFINER, search_path = public)
-- ============================================================================

-- is_super_admin()
create or replace function public.is_super_admin()
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'super_admin'
      and is_active = true
  );
end;
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- is_admin_or_above()
create or replace function public.is_admin_or_above()
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('super_admin', 'admin')
      and is_active = true
  );
end;
$$;

revoke all on function public.is_admin_or_above() from public, anon;
grant execute on function public.is_admin_or_above() to authenticated;

-- current_role()
create or replace function public.current_role()
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role text;
begin
  select role::text into v_role from public.profiles
  where id = (select auth.uid()) and is_active = true;
  return coalesce(v_role, 'none');
end;
$$;

revoke all on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;

-- current_app_role() alias
create or replace function public.current_app_role()
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  return public.current_role();
end;
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

-- team_member_ids(p_manager uuid) → recursive set of everyone reporting to p_manager
create or replace function public.team_member_ids(p_manager uuid)
  returns setof uuid
  language sql
  security definer
  set search_path = public
  stable
as $$
  with recursive tree as (
    select id from public.profiles
    where reports_to = p_manager and is_active = true
    union
    select p.id from public.profiles p
    join tree t on p.reports_to = t.id
    where p.is_active = true
  )
  select id from tree;
$$;

revoke all on function public.team_member_ids(uuid) from public, anon;
grant execute on function public.team_member_ids(uuid) to authenticated;

-- visible_user_ids() → who can the caller see?
create or replace function public.visible_user_ids()
  returns setof uuid
  language plpgsql
  security definer
  set search_path = public
  stable
as $$
declare
  v_uid uuid;
  v_role text;
  v_scope text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return;
  end if;

  select role::text, admin_scope into v_role, v_scope
  from public.profiles where id = v_uid and is_active = true;

  if v_role = 'super_admin' then
    return query select id from public.profiles where is_active = true;
  elsif v_role = 'admin' and v_scope = 'company' then
    return query select id from public.profiles where is_active = true;
  elsif v_role = 'admin' and v_scope = 'team' then
    return next v_uid;
    return query select * from public.team_member_ids(v_uid);
  else
    return next v_uid;
  end if;
end;
$$;

revoke all on function public.visible_user_ids() from public, anon;
grant execute on function public.visible_user_ids() to authenticated;

-- can_manage_user(p_target uuid)
create or replace function public.can_manage_user(p_target uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid uuid;
  v_caller_role text;
  v_target_role text;
  v_active_sa_count int;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return false;
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid and is_active = true;

  select role::text into v_target_role
  from public.profiles where id = p_target;

  if v_caller_role = 'super_admin' then
    if v_target_role = 'super_admin' and p_target = v_uid then
      select count(*) into v_active_sa_count
      from public.profiles
      where role = 'super_admin' and is_active = true and id != p_target;
      return v_active_sa_count >= 1;
    end if;
    return true;
  elsif v_caller_role = 'admin' then
    if v_target_role != 'staff' then
      return false;
    end if;
    return p_target in (select * from public.visible_user_ids());
  else
    return false;
  end if;
end;
$$;

revoke all on function public.can_manage_user(uuid) from public, anon;
grant execute on function public.can_manage_user(uuid) to authenticated;

-- is_owner() as alias of is_super_admin()
create or replace function public.is_owner()
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  return public.is_super_admin();
end;
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Update is_active_user() for support accounts
create or replace function public.is_active_user()
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_is_active boolean;
  v_is_support boolean;
  v_support_enabled boolean;
begin
  select is_active, is_support into v_is_active, v_is_support
  from public.profiles where id = (select auth.uid());

  if v_is_active is not true then
    return false;
  end if;

  if v_is_support is true then
    select support_access_enabled into v_support_enabled
    from public.company_settings limit 1;
    return coalesce(v_support_enabled, false);
  end if;

  return true;
end;
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- 3. Create job_titles lookup table & RLS policies
-- ============================================================================
create table if not exists public.job_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.job_titles enable row level security;

drop policy if exists "job_titles_select" on public.job_titles;
create policy "job_titles_select" on public.job_titles
  for select to authenticated using (public.is_active_user());

drop policy if exists "job_titles_insert" on public.job_titles;
create policy "job_titles_insert" on public.job_titles
  for insert to authenticated with check (public.is_admin_or_above());

drop policy if exists "job_titles_update" on public.job_titles;
create policy "job_titles_update" on public.job_titles
  for update to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

-- Seed default job titles
insert into public.job_titles (name, sort_order) values
  ('Owner', 1),
  ('Head of Department', 2),
  ('Team Lead', 3),
  ('HR', 4),
  ('BDM', 5),
  ('Admission Counsellor', 6),
  ('Counsellor', 7),
  ('BDE', 8),
  ('Accounts', 9),
  ('Support', 10)
on conflict (name) do nothing;

-- 4. Reports-to cycle prevention trigger
-- ============================================================================
create or replace function public.trg_prevent_reports_to_cycle()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_current uuid;
  v_depth int := 0;
begin
  if new.reports_to is null then
    return new;
  end if;

  if new.reports_to = new.id then
    raise exception 'A user cannot report to themselves.';
  end if;

  v_current := new.reports_to;
  while v_current is not null and v_depth < 30 loop
    if v_current = new.id then
      raise exception 'Circular reporting chain detected.';
    end if;
    select reports_to into v_current from public.profiles where id = v_current;
    v_depth := v_depth + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_prevent_reports_to_cycle on public.profiles;
create trigger trg_prevent_reports_to_cycle
  before insert or update of reports_to on public.profiles
  for each row execute function public.trg_prevent_reports_to_cycle();

-- 5. Role assignment rules trigger on profiles
-- ============================================================================
create or replace function public.trg_validate_role_assignment()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_active_sa_count int;
begin
  v_caller_id := (select auth.uid());

  -- Bypass trigger when no auth context (e.g. initial setup / migration / service role)
  if v_caller_id is null then
    return new;
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_caller_id and is_active = true;

  -- On INSERT
  if tg_op = 'INSERT' then
    if v_caller_role = 'super_admin' then
      return new;
    elsif v_caller_role = 'admin' then
      if new.role::text != 'staff' then
        raise exception 'Admins can only create staff members.';
      end if;
      if new.reports_to is not null and not (new.reports_to in (select * from public.visible_user_ids())) then
        raise exception 'Reports-to manager must be within the admin scope.';
      end if;
      return new;
    else
      raise exception 'Only Super Admins and Admins can create staff profiles.';
    end if;
  end if;

  -- On UPDATE
  if new.id = v_caller_id and new.role::text != old.role::text then
    raise exception 'You cannot change your own role.';
  end if;

  if new.role::text != old.role::text then
    if new.role::text in ('super_admin', 'admin') and v_caller_role != 'super_admin' then
      raise exception 'Only Super Admins can assign the % role.', new.role::text;
    end if;

    if v_caller_role = 'admin' and new.role::text != 'staff' then
      raise exception 'Admins can only assign the Staff role.';
    end if;

    if old.role::text = 'super_admin' and new.role::text != 'super_admin' then
      select count(*) into v_active_sa_count
      from public.profiles
      where role = 'super_admin' and is_active = true and id != new.id;
      if v_active_sa_count < 1 then
        raise exception 'Cannot demote the last active Super Admin.';
      end if;
    end if;
  end if;

  if old.is_active = true and new.is_active = false and old.role::text = 'super_admin' then
    select count(*) into v_active_sa_count
    from public.profiles
    where role = 'super_admin' and is_active = true and id != new.id;
    if v_active_sa_count < 1 then
      raise exception 'Cannot deactivate the last active Super Admin.';
    end if;
  end if;

  if new.admin_scope is distinct from old.admin_scope and v_caller_role != 'super_admin' then
    raise exception 'Only Super Admins can set admin scope.';
  end if;

  if new.is_support is distinct from old.is_support and v_caller_role != 'super_admin' then
    raise exception 'Only Super Admins can configure support accounts.';
  end if;

  if v_caller_role = 'admin' and new.reports_to is distinct from old.reports_to then
    if new.reports_to is not null and not (new.reports_to in (select * from public.visible_user_ids())) then
      raise exception 'Reports-to manager must be within your team scope.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_last_owner_guard on public.profiles;
drop trigger if exists trg_validate_role_assignment on public.profiles;
create trigger trg_validate_role_assignment
  before insert or update on public.profiles
  for each row execute function public.trg_validate_role_assignment();

-- 6. Allow cleanup deletion on candidate_documents
-- ============================================================================
create or replace function public.prevent_candidate_document_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.allow_test_cleanup', true) = 'on' or (select auth.role()) = 'service_role' then
    return old;
  end if;
  raise exception 'Direct deletion of candidate documents is prohibited. Use archive instead.';
end;
$$;

-- 7. RLS Policy Updates
-- ============================================================================

drop policy if exists "company_settings_update" on public.company_settings;
create policy "company_settings_update" on public.company_settings
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (public.is_active_user());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin_or_above())
  with check (id = (select auth.uid()) or public.is_admin_or_above());

drop policy if exists "universities_insert" on public.universities;
create policy "universities_insert" on public.universities
  for insert to authenticated with check (public.is_admin_or_above());

drop policy if exists "universities_update" on public.universities;
create policy "universities_update" on public.universities
  for update to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

drop policy if exists "courses_insert" on public.courses;
create policy "courses_insert" on public.courses
  for insert to authenticated with check (public.is_admin_or_above());

drop policy if exists "courses_update" on public.courses;
create policy "courses_update" on public.courses
  for update to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

drop policy if exists "specializations_insert" on public.specializations;
create policy "specializations_insert" on public.specializations
  for insert to authenticated with check (public.is_admin_or_above());

drop policy if exists "specializations_update" on public.specializations;
create policy "specializations_update" on public.specializations
  for update to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

drop policy if exists "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated
  using (public.is_admin_or_above() or created_by = (select auth.uid()))
  with check (public.is_admin_or_above() or created_by = (select auth.uid()));

drop policy if exists "enrollments_update" on public.enrollments;
create policy "enrollments_update" on public.enrollments
  for update to authenticated
  using (public.is_admin_or_above())
  with check (public.is_admin_or_above());

drop policy if exists "email_rate_limits_select" on public.email_rate_limits;
create policy "email_rate_limits_select" on public.email_rate_limits
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_above());

drop policy if exists "student_addresses_update" on public.student_addresses;
create policy "student_addresses_update" on public.student_addresses
  for update to authenticated
  using (
    public.is_admin_or_above() or exists (
      select 1 from public.students s where s.id = student_id and s.created_by = (select auth.uid())
    )
  )
  with check (
    public.is_admin_or_above() or exists (
      select 1 from public.students s where s.id = student_id and s.created_by = (select auth.uid())
    )
  );

-- 8. RPC: void_payment (super_admin, or admin if admins_can_void)
-- ============================================================================
drop function if exists public.void_payment(uuid, text);

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
  v_caller_role text;
  v_admins_can_void boolean;
  v_payment payments;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Not authenticated';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_caller_id;

  if v_caller_role = 'super_admin' then
    -- allowed
  elsif v_caller_role = 'admin' then
    select admins_can_void into v_admins_can_void
    from public.company_settings limit 1;
    if not coalesce(v_admins_can_void, false) then
      raise exception 'Admins are not permitted to void receipts. Contact your Super Admin.';
    end if;
  else
    raise exception 'Only Super Admins (or Admins when permitted) can void receipts.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is required to void a receipt.';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found.';
  end if;

  if v_payment.status = 'void' then
    raise exception 'This payment is already voided.';
  end if;

  update public.payments
  set status = 'void',
      voided_at = now(),
      voided_by = v_caller_id,
      void_reason = trim(p_reason),
      voided_by_name = (select full_name from public.profiles where id = v_caller_id)
  where id = p_payment_id
  returning * into v_payment;

  insert into public.audit_log (action, table_name, record_id, user_id, details)
  values (
    'void_payment',
    'payments',
    p_payment_id,
    v_caller_id,
    jsonb_build_object(
      'receipt_no', v_payment.receipt_no,
      'amount', v_payment.amount,
      'reason', trim(p_reason)
    )
  );

  return v_payment;
end;
$$;

revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- 9. RPC: get_staff_list (enhanced with job_title, reports_to, admin_scope)
-- ============================================================================
drop function if exists public.get_staff_list();

create or replace function public.get_staff_list()
  returns table (
    id uuid,
    full_name text,
    email text,
    phone text,
    role app_role,
    job_title text,
    reports_to uuid,
    reports_to_name text,
    admin_scope text,
    is_support boolean,
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
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin_or_above() then
    raise exception 'Access denied: staff management requires Admin or Super Admin privileges';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    p.role,
    p.job_title,
    p.reports_to,
    mgr.full_name as reports_to_name,
    p.admin_scope,
    p.is_support,
    p.is_active,
    u.last_sign_in_at,
    p.created_at,
    coalesce(coll.total, 0::numeric(12,2)) as collections_this_month
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profiles mgr on mgr.id = p.reports_to
  left join lateral (
    select sum(amount) as total
    from public.payments
    where received_by = p.id
      and status = 'valid'
      and paid_at >= date_trunc('month', now() at time zone 'Asia/Dubai')
  ) coll on true
  where p.id in (select * from public.visible_user_ids())
  order by
    case p.role::text
      when 'super_admin' then 1
      when 'admin' then 2
      when 'staff' then 3
      else 4
    end,
    p.full_name;
end;
$$;

revoke all on function public.get_staff_list() from public, anon;
grant execute on function public.get_staff_list() to authenticated;

-- 10. RPC: import_programs (admin_or_above)
-- ============================================================================
drop function if exists public.import_programs(jsonb);

create or replace function public.import_programs(p_data jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_caller_id uuid;
  v_row jsonb;
  v_uni_id uuid;
  v_course_id uuid;
  v_spec_id uuid;
  v_inserted_count int := 0;
  v_skipped_count int := 0;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null or not public.is_admin_or_above() then
    raise exception 'Only Super Admins and Admins can import programs.';
  end if;

  for v_row in select * from jsonb_array_elements(p_data) loop
    insert into public.universities (name, country, is_active)
    values (
      trim(v_row->>'university'),
      coalesce(trim(nullif(v_row->>'country', '')), 'UAE'),
      true
    )
    on conflict (name) do update set country = excluded.country
    returning id into v_uni_id;

    insert into public.courses (university_id, name, default_fee, is_active)
    values (
      v_uni_id,
      trim(v_row->>'course'),
      coalesce((v_row->>'default_fee')::numeric, 0),
      true
    )
    on conflict (university_id, name) do update set
      default_fee = coalesce(excluded.default_fee, courses.default_fee)
    returning id into v_course_id;

    if v_row->>'specialization' is not null and trim(v_row->>'specialization') != '' then
      insert into public.specializations (course_id, name, default_fee, is_active)
      values (
        v_course_id,
        trim(v_row->>'specialization'),
        coalesce((v_row->>'spec_fee')::numeric, null),
        true
      )
      on conflict (course_id, name) do update set
        default_fee = coalesce(excluded.default_fee, specializations.default_fee)
      returning id into v_spec_id;
    end if;

    v_inserted_count := v_inserted_count + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted_count, 'skipped', v_skipped_count);
end;
$$;

revoke all on function public.import_programs(jsonb) from public, anon;
grant execute on function public.import_programs(jsonb) to authenticated;

-- 11. RPC: update_enrollment_opening_paid (super_admin or scoped admin)
-- ============================================================================
create or replace function public.update_enrollment_opening_paid(
  p_enrollment_id uuid,
  p_opening_paid numeric,
  p_opening_paid_note text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_admission_staff_id uuid;
  v_old_opening_paid numeric(12,2);
  v_old_note text;
  v_payment_count int;
  v_total_paid numeric(12,2);
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  select admission_staff_id, opening_paid, opening_paid_note
  into v_admission_staff_id, v_old_opening_paid, v_old_note
  from public.enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  if v_caller_role = 'super_admin' then
    -- allowed
  elsif v_caller_role = 'admin' then
    if not (v_admission_staff_id in (select * from public.visible_user_ids())) then
      raise exception 'Admins can only edit opening balance for candidates within their scope.';
    end if;
  else
    raise exception 'forbidden: only Super Admins and authorized Admins can edit opening balance';
  end if;

  if p_opening_paid is null or p_opening_paid < 0 then
    raise exception 'Opening paid must be greater than or equal to 0';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_payment_count, v_total_paid
  from public.payments
  where enrollment_id = p_enrollment_id and status = 'valid';

  if v_payment_count > 0 and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'A reason (at least 3 characters) is required to modify opening paid for an enrollment with existing payments';
  end if;

  update public.enrollments
  set
    opening_paid = p_opening_paid,
    opening_paid_note = nullif(trim(p_opening_paid_note), ''),
    updated_at = now()
  where id = p_enrollment_id;

  insert into public.audit_log (action, table_name, record_id, user_id, details)
  values (
    'update_opening_paid',
    'enrollments',
    p_enrollment_id,
    v_uid,
    jsonb_build_object(
      'old_opening_paid', v_old_opening_paid,
      'new_opening_paid', p_opening_paid,
      'old_note', v_old_note,
      'new_note', trim(p_opening_paid_note),
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'opening_paid', p_opening_paid,
    'opening_paid_note', p_opening_paid_note,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.update_enrollment_opening_paid(uuid, numeric, text, text) from public, anon;
grant execute on function public.update_enrollment_opening_paid(uuid, numeric, text, text) to authenticated;

-- 12. RPC: update_enrollment_fee (super_admin or scoped admin)
-- ============================================================================
create or replace function public.update_enrollment_fee(
  p_enrollment_id uuid,
  p_total_fee numeric,
  p_discount numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_admission_staff_id uuid;
  v_old_fee numeric(12,2);
  v_old_discount numeric(12,2);
  v_payment_count int;
  v_total_paid numeric(12,2);
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select role::text into v_caller_role
  from public.profiles where id = v_uid;

  select admission_staff_id, total_fee, discount
  into v_admission_staff_id, v_old_fee, v_old_discount
  from public.enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  if v_caller_role = 'super_admin' then
    -- allowed
  elsif v_caller_role = 'admin' then
    if not (v_admission_staff_id in (select * from public.visible_user_ids())) then
      raise exception 'Admins can only edit fees for candidates within their scope.';
    end if;
  else
    raise exception 'forbidden: only Super Admins and authorized Admins can edit enrollment fees';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason (at least 3 characters) is required to modify enrollment fees';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_payment_count, v_total_paid
  from public.payments
  where enrollment_id = p_enrollment_id and status = 'valid';

  update public.enrollments
  set
    total_fee = p_total_fee,
    discount = coalesce(p_discount, 0),
    updated_at = now()
  where id = p_enrollment_id;

  insert into public.audit_log (action, table_name, record_id, user_id, details)
  values (
    'update_fee',
    'enrollments',
    p_enrollment_id,
    v_uid,
    jsonb_build_object(
      'old_total_fee', v_old_fee,
      'new_total_fee', p_total_fee,
      'old_discount', v_old_discount,
      'new_discount', coalesce(p_discount, 0),
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'total_fee', p_total_fee,
    'discount', p_discount,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.update_enrollment_fee(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.update_enrollment_fee(uuid, numeric, numeric, text) to authenticated;

-- 13. RPC: verify_candidate_document (super_admin, admin, or assigned staff)
-- ============================================================================
create or replace function public.verify_candidate_document(
  p_document_id uuid,
  p_status text,
  p_notes text default null
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_doc public.candidate_documents;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'unauthorized';
  end if;

  if p_status not in ('verified', 'rejected', 'received') then
    raise exception 'invalid status: %', p_status;
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
    raise exception 'forbidden: only Super Admins, Admins, or assigned admission staff can verify or reject documents';
  end if;

  update public.candidate_documents
  set
    status = p_status,
    notes = coalesce(p_notes, notes),
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    verified_by = case when p_status = 'verified' then v_user_id else verified_by end,
    rejected_at = case when p_status = 'rejected' then now() else rejected_at end,
    rejected_by = case when p_status = 'rejected' then v_user_id else rejected_by end,
    rejection_reason = case when p_status = 'rejected' then coalesce(p_notes, rejection_reason) else rejection_reason end,
    updated_at = now()
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  insert into public.audit_log (action, table_name, record_id, user_id, details)
  values (
    'verify_candidate_document',
    'candidate_documents',
    p_document_id,
    v_user_id,
    jsonb_build_object(
      'status', p_status,
      'notes', p_notes,
      'student_id', v_doc.student_id
    )
  );

  return v_doc;
end;
$$;

revoke all on function public.verify_candidate_document(uuid, text, text) from public, anon;
grant execute on function public.verify_candidate_document(uuid, text, text) to authenticated;

-- 14. Reports RPCs: scoped filtering via visible_user_ids()
-- ============================================================================

-- A. dashboard_kpis
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

  if v_caller_role = 'super_admin' then
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
    'top_unis', v_top_unis,
    'top_courses', v_top_courses
  );
end;
$$;

revoke all on function public.dashboard_kpis(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.dashboard_kpis(timestamptz, timestamptz, uuid) to authenticated;

-- B. report_collections
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

  if v_caller_role = 'super_admin' then
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

-- C. report_outstanding
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

  if v_caller_role = 'super_admin' then
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

-- D. report_dayend
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

  if v_caller_role = 'super_admin' then
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

-- E. report_voids
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

  if v_caller_role = 'super_admin' then
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
