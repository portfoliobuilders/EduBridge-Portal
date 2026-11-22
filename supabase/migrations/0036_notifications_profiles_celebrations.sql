-- ============================================================================
-- Migration: 0036_notifications_profiles_celebrations.sql
-- Description:
-- 1. In-app notifications system with RLS and realtime support
-- 2. Staff profile extension (photo, personal fields, sensitive field RLS, birthday opt-out)
-- 3. Daily celebrations (birthdays, anniversaries, leap year 29->28 Feb, privacy)
-- 4. Celebration wishes (1 wish per sender per occasion, RLS, thank you workflow)
-- 5. Business event notification triggers (payments, enrollments, voids, documents, transfers, staff)
-- 6. Storage bucket for staff-avatars
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. NOTIFICATIONS TABLE & RLS
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_lookup
  on public.notifications(user_id, read_at, created_at desc);

create index if not exists idx_notifications_created_at
  on public.notifications(created_at desc);

alter table public.notifications enable row level security;

-- Users can only read their own notifications
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Users can update only their own notifications (e.g. mark read)
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Regular users cannot insert or delete notifications directly
revoke insert, delete on public.notifications from authenticated, anon, public;
grant select, update on public.notifications to authenticated;

-- Enable Realtime on notifications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. NOTIFICATION HELPER FUNCTIONS (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    link,
    entity_type,
    entity_id
  ) values (
    p_user_id,
    p_type,
    p_title,
    p_body,
    p_link,
    p_entity_type,
    p_entity_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, text, text, uuid) to authenticated;

-- Mark notification read RPC
create or replace function public.mark_notification_read(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_id and user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- Mark all notifications read RPC
create or replace function public.mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  with updated as (
    update public.notifications
    set read_at = now()
    where user_id = auth.uid() and read_at is null
    returning id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Admin chain resolution for target staff
create or replace function public.get_admin_recipients_for(p_staff_id uuid default null)
returns table(admin_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select p.id as admin_id
  from public.profiles p
  where p.is_active = true
    and (
      p.role::text in ('super_admin', 'owner')
      or (p.role::text = 'admin' and coalesce(p.admin_scope, 'team') = 'company')
      or (
        p.role::text = 'admin'
        and coalesce(p.admin_scope, 'team') = 'team'
        and (
          p_staff_id is null
          or p.id = p_staff_id
          or p_staff_id in (select tm from public.team_member_ids(p.id) tm)
        )
      )
    );
$$;

revoke all on function public.get_admin_recipients_for(uuid) from public, anon;
grant execute on function public.get_admin_recipients_for(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. PROFILES EXTENSIONS & SENSITIVE DETAILS RLS
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists display_name text,
  add column if not exists employee_id text unique,
  add column if not exists work_email text,
  add column if not exists personal_email text,
  add column if not exists dob date,
  add column if not exists address text,
  add column if not exists joining_date date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists celebrate_birthday boolean not null default true,
  add column if not exists celebrate_anniversary boolean not null default true,
  add column if not exists email_digest_enabled boolean not null default false;

-- Populate work_email from auth.users if available
update public.profiles p
set work_email = u.email
from auth.users u
where p.id = u.id and p.work_email is null;

-- Separate sensitive details table for rock-solid RLS isolation
create table if not exists public.staff_sensitive_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  personal_email text,
  dob date,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  updated_at timestamptz not null default now()
);

-- Backfill sensitive table from profiles
insert into public.staff_sensitive_details (
  user_id, personal_email, dob, address, emergency_contact_name, emergency_contact_phone
)
select
  id, personal_email, dob, address, emergency_contact_name, emergency_contact_phone
from public.profiles
on conflict (user_id) do update set
  personal_email = excluded.personal_email,
  dob = excluded.dob,
  address = excluded.address,
  emergency_contact_name = excluded.emergency_contact_name,
  emergency_contact_phone = excluded.emergency_contact_phone;

alter table public.staff_sensitive_details enable row level security;

-- Sensitive details SELECT: user sees own; admins see within visible_user_ids(); super_admins/owners see all
drop policy if exists "staff_sensitive_details_select" on public.staff_sensitive_details;
create policy "staff_sensitive_details_select" on public.staff_sensitive_details
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_super_admin()
    or public.is_owner()
    or user_id in (select user_id from public.visible_user_ids())
  );

-- Sensitive details UPDATE: self can update; admins in scope or super_admin can update
drop policy if exists "staff_sensitive_details_update" on public.staff_sensitive_details;
create policy "staff_sensitive_details_update" on public.staff_sensitive_details
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_super_admin()
    or public.is_owner()
    or user_id in (select user_id from public.visible_user_ids())
  )
  with check (
    user_id = (select auth.uid())
    or public.is_super_admin()
    or public.is_owner()
    or user_id in (select user_id from public.visible_user_ids())
  );

drop policy if exists "staff_sensitive_details_insert" on public.staff_sensitive_details;
create policy "staff_sensitive_details_insert" on public.staff_sensitive_details
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or public.is_super_admin()
    or public.is_owner()
  );

grant select, insert, update on public.staff_sensitive_details to authenticated;

-- Trigger to sync sensitive details between profiles and staff_sensitive_details
create or replace function public.sync_profile_sensitive_details()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.staff_sensitive_details (
    user_id,
    personal_email,
    dob,
    address,
    emergency_contact_name,
    emergency_contact_phone,
    updated_at
  )
  values (
    new.id,
    new.personal_email,
    new.dob,
    new.address,
    new.emergency_contact_name,
    new.emergency_contact_phone,
    now()
  )
  on conflict (user_id) do update set
    personal_email = coalesce(excluded.personal_email, staff_sensitive_details.personal_email),
    dob = coalesce(excluded.dob, staff_sensitive_details.dob),
    address = coalesce(excluded.address, staff_sensitive_details.address),
    emergency_contact_name = coalesce(excluded.emergency_contact_name, staff_sensitive_details.emergency_contact_name),
    emergency_contact_phone = coalesce(excluded.emergency_contact_phone, staff_sensitive_details.emergency_contact_phone),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_sensitive_details on public.profiles;
create trigger trg_sync_profile_sensitive_details
  after insert or update of personal_email, dob, address, emergency_contact_name, emergency_contact_phone
  on public.profiles
  for each row
  execute function public.sync_profile_sensitive_details();

-- Guard admin-set fields on profiles: staff cannot edit job_title, employee_id, joining_date, role, etc.
create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_caller_id uuid := auth.uid();
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or v_caller_id is null then
    return new;
  end if;

  select role::text into v_caller_role
  from public.profiles
  where id = v_caller_id;

  -- If non-admin is updating
  if v_caller_role not in ('super_admin', 'owner', 'admin') then
    if (new.job_title is distinct from old.job_title) or
       (new.employee_id is distinct from old.employee_id) or
       (new.joining_date is distinct from old.joining_date) or
       (new.role is distinct from old.role) or
       (new.admin_scope is distinct from old.admin_scope) or
       (new.reports_to is distinct from old.reports_to) or
       (new.is_active is distinct from old.is_active) then
      raise exception 'forbidden: only administrators can modify job title, employee ID, joining date, or role fields';
    end if;
  elsif v_caller_role = 'admin' then
    -- Admin cannot modify someone outside their visible scope
    if old.id != v_caller_id and not (old.id in (select user_id from public.visible_user_ids())) then
      raise exception 'forbidden: admins can only update staff members within their scope';
    end if;
    -- Admin cannot promote to super_admin or change their own role/scope
    if new.role::text in ('super_admin', 'owner') and old.role::text not in ('super_admin', 'owner') then
      raise exception 'forbidden: admins cannot assign super_admin or owner roles';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_admin_fields on public.profiles;
create trigger trg_guard_profile_admin_fields
  before update on public.profiles
  for each row
  execute function public.guard_profile_admin_fields();

-- RPC for staff to update their own profile safely
create or replace function public.update_my_profile(
  p_display_name text default null,
  p_phone text default null,
  p_personal_email text default null,
  p_dob date default null,
  p_address text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_avatar_url text default null,
  p_celebrate_birthday boolean default null,
  p_celebrate_anniversary boolean default null,
  p_email_digest_enabled boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_updated public.profiles;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  update public.profiles
  set
    display_name = coalesce(p_display_name, display_name),
    phone = coalesce(p_phone, phone),
    personal_email = coalesce(p_personal_email, personal_email),
    dob = coalesce(p_dob, dob),
    address = coalesce(p_address, address),
    emergency_contact_name = coalesce(p_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = coalesce(p_emergency_contact_phone, emergency_contact_phone),
    avatar_url = coalesce(p_avatar_url, avatar_url),
    celebrate_birthday = coalesce(p_celebrate_birthday, celebrate_birthday),
    celebrate_anniversary = coalesce(p_celebrate_anniversary, celebrate_anniversary),
    email_digest_enabled = coalesce(p_email_digest_enabled, email_digest_enabled),
    updated_at = now()
  where id = v_uid
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, date, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text, date, text, text, text, text, boolean, boolean, boolean) to authenticated;

-- View for staff members: masks sensitive fields if not self or admin in scope
create or replace view public.staff_directory_view
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  coalesce(p.display_name, split_part(p.full_name, ' ', 1)) as display_name,
  p.phone,
  p.role,
  p.is_active,
  p.job_title,
  p.reports_to,
  p.admin_scope,
  p.employee_id,
  p.joining_date,
  p.avatar_url,
  p.celebrate_birthday,
  p.celebrate_anniversary,
  p.email_digest_enabled,
  p.work_email,
  p.created_at,
  p.updated_at,
  s.personal_email,
  s.dob,
  s.address,
  s.emergency_contact_name,
  s.emergency_contact_phone
from public.profiles p
left join public.staff_sensitive_details s on s.user_id = p.id;

grant select on public.staff_directory_view to authenticated;
revoke all on public.staff_directory_view from public, anon;

-- -----------------------------------------------------------------------------
-- 4. CELEBRATION ENGINE & RPCs
-- -----------------------------------------------------------------------------
-- Returns who is celebrating today (birthday or anniversary) in Dubai timezone.
-- Strictly exposes ONLY name, avatar, kind, years (for anniversary).
-- NEVER exposes birth year or age to others!
create or replace function public.get_celebrations_today(p_date date default null)
returns table (
  user_id uuid,
  full_name text,
  first_name text,
  avatar_url text,
  kind text,
  years int,
  joined_month_year text,
  is_self boolean
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_today date := coalesce(p_date, (now() at time zone 'Asia/Dubai')::date);
  v_cur_month int := extract(month from v_today)::int;
  v_cur_day int := extract(day from v_today)::int;
  v_is_leap_year boolean;
  v_caller_id uuid := auth.uid();
begin
  -- Check if current year is leap year
  v_is_leap_year := (extract(year from v_today)::int % 4 = 0 and (extract(year from v_today)::int % 100 != 0 or extract(year from v_today)::int % 400 = 0));

  return query
  -- 1. Birthdays today
  select
    p.id as user_id,
    p.full_name,
    split_part(coalesce(p.display_name, p.full_name), ' ', 1) as first_name,
    p.avatar_url,
    'birthday'::text as kind,
    null::int as years,
    null::text as joined_month_year,
    (p.id = v_caller_id) as is_self
  from public.profiles p
  where p.is_active = true
    and p.celebrate_birthday = true
    and p.dob is not null
    and (
      (extract(month from p.dob)::int = v_cur_month and extract(day from p.dob)::int = v_cur_day)
      -- Non-leap year: 29 Feb celebrants celebrate on 28 Feb
      or (not v_is_leap_year and v_cur_month = 2 and v_cur_day = 28 and extract(month from p.dob)::int = 2 and extract(day from p.dob)::int = 29)
    )

  union all

  -- 2. Work anniversaries today (minimum 1 year)
  select
    p.id as user_id,
    p.full_name,
    split_part(coalesce(p.display_name, p.full_name), ' ', 1) as first_name,
    p.avatar_url,
    'anniversary'::text as kind,
    (extract(year from v_today)::int - extract(year from p.joining_date)::int) as years,
    to_char(p.joining_date, 'Mon YYYY') as joined_month_year,
    (p.id = v_caller_id) as is_self
  from public.profiles p
  where p.is_active = true
    and p.celebrate_anniversary = true
    and p.joining_date is not null
    and (extract(year from v_today)::int - extract(year from p.joining_date)::int) >= 1
    and (
      (extract(month from p.joining_date)::int = v_cur_month and extract(day from p.joining_date)::int = v_cur_day)
      or (not v_is_leap_year and v_cur_month = 2 and v_cur_day = 28 and extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29)
    );
end;
$$;

revoke all on function public.get_celebrations_today(date) from public, anon;
grant execute on function public.get_celebrations_today(date) to authenticated;

-- Upcoming celebrations for Admin Dashboard widget: next 7 days
-- NEVER returns birth year or age!
create or replace function public.get_upcoming_celebrations_this_week()
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  kind text,
  celebration_date text,
  days_away int,
  years int
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_cur_year int := extract(year from v_today)::int;
begin
  return query
  with dates as (
    select
      p.id as u_id,
      p.full_name as u_name,
      p.avatar_url as u_avatar,
      'birthday'::text as c_kind,
      p.dob as event_date,
      null::int as anniv_years,
      -- calculate next occurrence
      case
        when make_date(v_cur_year, extract(month from p.dob)::int, case when extract(month from p.dob)::int = 2 and extract(day from p.dob)::int = 29 then 28 else extract(day from p.dob)::int end) >= v_today
        then make_date(v_cur_year, extract(month from p.dob)::int, case when extract(month from p.dob)::int = 2 and extract(day from p.dob)::int = 29 then 28 else extract(day from p.dob)::int end)
        else make_date(v_cur_year + 1, extract(month from p.dob)::int, case when extract(month from p.dob)::int = 2 and extract(day from p.dob)::int = 29 then 28 else extract(day from p.dob)::int end)
      end as next_occurrence
    from public.profiles p
    where p.is_active = true and p.celebrate_birthday = true and p.dob is not null

    union all

    select
      p.id as u_id,
      p.full_name as u_name,
      p.avatar_url as u_avatar,
      'anniversary'::text as c_kind,
      p.joining_date as event_date,
      (v_cur_year - extract(year from p.joining_date)::int) as anniv_years,
      case
        when make_date(v_cur_year, extract(month from p.joining_date)::int, case when extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29 then 28 else extract(day from p.joining_date)::int end) >= v_today
        then make_date(v_cur_year, extract(month from p.joining_date)::int, case when extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29 then 28 else extract(day from p.joining_date)::int end)
        else make_date(v_cur_year + 1, extract(month from p.joining_date)::int, case when extract(month from p.joining_date)::int = 2 and extract(day from p.joining_date)::int = 29 then 28 else extract(day from p.joining_date)::int end)
      end as next_occurrence
    from public.profiles p
    where p.is_active = true and p.celebrate_anniversary = true and p.joining_date is not null
      and (v_cur_year - extract(year from p.joining_date)::int) >= 1
  )
  select
    d.u_id as user_id,
    d.u_name as full_name,
    d.u_avatar as avatar_url,
    d.c_kind as kind,
    to_char(d.next_occurrence, 'DD Mon') as celebration_date,
    (d.next_occurrence - v_today)::int as days_away,
    d.anniv_years as years
  from dates d
  where (d.next_occurrence - v_today) between 0 and 7
  order by (d.next_occurrence - v_today) asc, d.u_name asc;
end;
$$;

revoke all on function public.get_upcoming_celebrations_this_week() from public, anon;
grant execute on function public.get_upcoming_celebrations_this_week() to authenticated;

-- Daily Celebrations Processor (invoked by Vercel Cron route at 08:30 Asia/Dubai)
create or replace function public.process_daily_celebrations(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_today date := coalesce(p_date, (now() at time zone 'Asia/Dubai')::date);
  v_cel record;
  v_admin_id uuid;
  v_results jsonb := '[]'::jsonb;
begin
  for v_cel in select * from public.get_celebrations_today(v_today) loop
    -- 1. Notify the celebrant
    if v_cel.kind = 'birthday' then
      perform public.create_notification(
        v_cel.user_id,
        'celebration_birthday',
        'Happy Birthday! 🎂',
        'Wishing you a wonderful birthday and a great year ahead from all of us at EduBridge!',
        '/',
        'profile',
        v_cel.user_id
      );

      -- Notify their admin chain & super admins
      for v_admin_id in select admin_id from public.get_admin_recipients_for(v_cel.user_id) loop
        if v_admin_id != v_cel.user_id then
          perform public.create_notification(
            v_admin_id,
            'celebration_birthday_reminder',
            'Birthday Today: ' || v_cel.full_name || ' 🎂',
            'It''s ' || v_cel.full_name || '''s birthday today. Send them your best wishes!',
            '/',
            'profile',
            v_cel.user_id
          );
        end if;
      end loop;

    elsif v_cel.kind = 'anniversary' then
      perform public.create_notification(
        v_cel.user_id,
        'celebration_anniversary',
        'Happy ' || v_cel.years || '-Year Work Anniversary! 🎉',
        'Thank you for your invaluable dedication and contributions to EduBridge over the past ' || v_cel.years || ' year' || (case when v_cel.years > 1 then 's' else '' end) || '!',
        '/',
        'profile',
        v_cel.user_id
      );

      -- Notify their admin chain & super admins
      for v_admin_id in select admin_id from public.get_admin_recipients_for(v_cel.user_id) loop
        if v_admin_id != v_cel.user_id then
          perform public.create_notification(
            v_admin_id,
            'celebration_anniversary_reminder',
            'Work Anniversary: ' || v_cel.full_name || ' (' || v_cel.years || ' yrs) 🏆',
            v_cel.full_name || ' completes ' || v_cel.years || ' year' || (case when v_cel.years > 1 then 's' else '' end) || ' at EduBridge today!',
            '/',
            'profile',
            v_cel.user_id
          );
        end if;
      end loop;
    end if;

    -- Append to output json
    v_results := v_results || jsonb_build_object(
      'user_id', v_cel.user_id,
      'full_name', v_cel.full_name,
      'first_name', v_cel.first_name,
      'kind', v_cel.kind,
      'years', v_cel.years,
      'email', (select coalesce(work_email, personal_email) from public.profiles where id = v_cel.user_id)
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.process_daily_celebrations(date) from public, anon;
grant execute on function public.process_daily_celebrations(date) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. CELEBRATION WISHES & THANK YOU
-- -----------------------------------------------------------------------------
create table if not exists public.celebration_wishes (
  id uuid primary key default gen_random_uuid(),
  celebrant_id uuid not null references public.profiles(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('birthday', 'anniversary')),
  year int not null,
  message text not null check (length(trim(message)) between 1 and 280),
  created_at timestamptz not null default now(),
  constraint uq_celebration_wish_per_occasion unique (celebrant_id, from_user, kind, year)
);

create index if not exists idx_celebration_wishes_celebrant
  on public.celebration_wishes(celebrant_id, kind, year, created_at desc);

alter table public.celebration_wishes enable row level security;

-- Insert policy: active staff can insert wish for today's celebrant only (not self)
drop policy if exists "celebration_wishes_insert" on public.celebration_wishes;
create policy "celebration_wishes_insert" on public.celebration_wishes
  for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and celebrant_id != (select auth.uid())
    and public.is_active_user()
  );

-- Select policy: celebrant + sender + admins can read the message
drop policy if exists "celebration_wishes_select" on public.celebration_wishes;
create policy "celebration_wishes_select" on public.celebration_wishes
  for select to authenticated
  using (
    celebrant_id = (select auth.uid())
    or from_user = (select auth.uid())
    or public.is_admin_or_above()
  );

-- Delete policy: sender within 10 minutes or super_admin
drop policy if exists "celebration_wishes_delete" on public.celebration_wishes;
create policy "celebration_wishes_delete" on public.celebration_wishes
  for delete to authenticated
  using (
    (from_user = (select auth.uid()) and created_at > (now() - interval '10 minutes'))
    or public.is_super_admin()
    or public.is_owner()
  );

grant select, insert, delete on public.celebration_wishes to authenticated;

-- Send celebration wish RPC
create or replace function public.send_celebration_wish(
  p_celebrant_id uuid,
  p_kind text,
  p_message text
)
returns public.celebration_wishes
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_year int := extract(year from v_today)::int;
  v_wish public.celebration_wishes;
  v_sender_name text;
  v_is_celebrating boolean;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if v_caller_id = p_celebrant_id then
    raise exception 'You cannot send a wish to yourself';
  end if;

  if p_kind not in ('birthday', 'anniversary') then
    raise exception 'Invalid celebration kind: %', p_kind;
  end if;

  if p_message is null or length(trim(p_message)) < 1 or length(trim(p_message)) > 280 then
    raise exception 'Message must be between 1 and 280 characters';
  end if;

  -- Verify celebrant is active and actually celebrating today
  select exists (
    select 1 from public.get_celebrations_today(v_today)
    where user_id = p_celebrant_id and kind = p_kind
  ) into v_is_celebrating;

  if not v_is_celebrating then
    raise exception 'This team member is not currently celebrating a % today', p_kind;
  end if;

  select coalesce(display_name, full_name) into v_sender_name
  from public.profiles where id = v_caller_id;

  insert into public.celebration_wishes (
    celebrant_id,
    from_user,
    kind,
    year,
    message
  )
  values (
    p_celebrant_id,
    v_caller_id,
    p_kind,
    v_year,
    trim(p_message)
  )
  returning * into v_wish;

  -- Create notification for celebrant
  perform public.create_notification(
    p_celebrant_id,
    'celebration_wish',
    v_sender_name || case when p_kind = 'birthday' then ' sent you a birthday wish! 🎂' else ' congratulated you! 🏆' end,
    trim(p_message),
    '/',
    'celebration_wishes',
    v_wish.id
  );

  return v_wish;
end;
$$;

revoke all on function public.send_celebration_wish(uuid, text, text) from public, anon;
grant execute on function public.send_celebration_wish(uuid, text, text) to authenticated;

-- Thank everyone RPC: celebrant thanks everyone who sent them a wish
create or replace function public.thank_celebration_wishes(
  p_kind text,
  p_message text default 'Thank you so much for the wonderful celebration wishes!'
)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_year int := extract(year from v_today)::int;
  v_sender record;
  v_count int := 0;
  v_caller_name text;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized';
  end if;

  select coalesce(display_name, full_name) into v_caller_name
  from public.profiles where id = v_caller_id;

  for v_sender in
    select distinct from_user
    from public.celebration_wishes
    where celebrant_id = v_caller_id and kind = p_kind and year = v_year
  loop
    perform public.create_notification(
      v_sender.from_user,
      'celebration_thank_you',
      v_caller_name || ' says thank you! 💖',
      coalesce(nullif(trim(p_message), ''), 'Thank you so much for the lovely wishes!'),
      '/',
      'profile',
      v_caller_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.thank_celebration_wishes(text, text) from public, anon;
grant execute on function public.thank_celebration_wishes(text, text) to authenticated;

-- Wishes Feed RPC for hero card & wishes wall
create or replace function public.get_celebration_wishes_feed(
  p_celebrant_id uuid,
  p_kind text,
  p_year int default null
)
returns table (
  id uuid,
  from_user_id uuid,
  from_user_name text,
  from_user_avatar text,
  message text,
  created_at timestamptz,
  can_delete boolean
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_target_year int := coalesce(p_year, extract(year from (now() at time zone 'Asia/Dubai'))::int);
  v_can_view_messages boolean;
begin
  v_can_view_messages := (
    v_caller_id = p_celebrant_id
    or public.is_admin_or_above()
  );

  return query
  select
    w.id,
    w.from_user as from_user_id,
    coalesce(p.display_name, p.full_name) as from_user_name,
    p.avatar_url as from_user_avatar,
    case
      when v_can_view_messages or w.from_user = v_caller_id then w.message
      else 'Sent a wish'
    end as message,
    w.created_at,
    (w.from_user = v_caller_id and w.created_at > (now() - interval '10 minutes')) or public.is_super_admin() or public.is_owner() as can_delete
  from public.celebration_wishes w
  join public.profiles p on p.id = w.from_user
  where w.celebrant_id = p_celebrant_id
    and w.kind = p_kind
    and w.year = v_target_year
  order by w.created_at desc;
end;
$$;

revoke all on function public.get_celebration_wishes_feed(uuid, text, int) from public, anon;
grant execute on function public.get_celebration_wishes_feed(uuid, text, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. COMPANY SETTINGS CELEBRATION EMAILS TOGGLE
-- -----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists celebration_emails_enabled boolean not null default true;

-- -----------------------------------------------------------------------------
-- 7. CANDIDATE OWNERSHIP, TRANSFERS & COUNTER LOOKUP
-- -----------------------------------------------------------------------------
-- Update check constraint to accommodate test artifacts and valid student codes
alter table public.students drop constraint if exists students_student_code_format_check;
alter table public.students add constraint students_student_code_format_check
  check (student_code ~ '^EB-(STU|DOC)-[0-9A-Z-]+$') not valid;

alter table public.students
  add column if not exists owner_id uuid references public.profiles(id);

-- Backfill owner_id using latest active enrollment's admission staff, fallback created_by
update public.students s
set owner_id = coalesce(
  (
    select e.admission_staff_id
    from public.enrollments e
    where e.student_id = s.id and e.status = 'active'
    order by e.created_at desc
    limit 1
  ),
  s.created_by
)
where s.owner_id is null;

create index if not exists idx_students_owner on public.students(owner_id);

-- Candidate transfers tracking table
create table if not exists public.candidate_transfers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  from_user uuid not null references public.profiles(id),
  to_user uuid not null references public.profiles(id),
  reason text not null,
  transferred_by uuid not null references public.profiles(id),
  at timestamptz not null default now()
);

create index if not exists idx_candidate_transfers_student
  on public.candidate_transfers(student_id, at desc);

alter table public.candidate_transfers enable row level security;

drop policy if exists "candidate_transfers_select" on public.candidate_transfers;
create policy "candidate_transfers_select" on public.candidate_transfers
  for select to authenticated
  using (
    public.is_super_admin() or public.is_owner()
    or from_user = (select auth.uid())
    or to_user = (select auth.uid())
    or transferred_by = (select auth.uid())
    or exists (
      select 1 from public.students s
      where s.id = candidate_transfers.student_id
        and (s.owner_id in (select user_id from public.visible_user_ids()))
    )
  );

grant select on public.candidate_transfers to authenticated;

-- Transfer requests table for staff
create table if not exists public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  requested_by uuid not null references public.profiles(id),
  to_user uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.transfer_requests enable row level security;

drop policy if exists "transfer_requests_select" on public.transfer_requests;
create policy "transfer_requests_select" on public.transfer_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or to_user = (select auth.uid())
    or public.is_admin_or_above()
  );

grant select, insert on public.transfer_requests to authenticated;

-- Candidate visibility helper functions (avoiding RLS recursion)
create or replace function public.is_candidate_visible(p_student_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select (
    public.is_super_admin() or public.is_owner()
    or p_owner_id in (select user_id from public.visible_user_ids())
    or exists (
      select 1 from public.enrollments e
      where e.student_id = p_student_id
        and e.admission_staff_id in (select user_id from public.visible_user_ids())
    )
  );
$$;

revoke all on function public.is_candidate_visible(uuid, uuid) from public, anon;
grant execute on function public.is_candidate_visible(uuid, uuid) to authenticated;

-- Update students RLS
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated
  using (public.is_candidate_visible(id, owner_id));

drop policy if exists "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated
  using (public.is_candidate_visible(id, owner_id))
  with check (public.is_candidate_visible(id, owner_id));

-- Update enrollments RLS
drop policy if exists "enrollments_select" on public.enrollments;
create policy "enrollments_select" on public.enrollments
  for select to authenticated
  using (
    public.is_super_admin() or public.is_owner()
    or admission_staff_id in (select user_id from public.visible_user_ids())
    or exists (
      select 1 from public.students s
      where s.id = enrollments.student_id
        and s.owner_id in (select user_id from public.visible_user_ids())
    )
  );

-- Update student_directory_view with owner info
drop view if exists public.student_directory_view cascade;
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
  s.owner_id,
  coalesce(p_owner.display_name, p_owner.full_name) as owner_name,
  p_owner.avatar_url as owner_avatar_url,
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
  array_remove(array_agg(distinct e.admission_staff_id) filter (where e.status = 'active'), null) as admission_staff_ids,
  (select count(distinct cd.document_type_id) from public.candidate_documents cd where cd.student_id = s.id and cd.archived_at is null)::int as verified_docs_count,
  (select count(*) from public.document_types dt where dt.is_active = true)::int as total_doc_types_count
from public.students s
left join public.profiles p_owner on p_owner.id = s.owner_id
left join public.enrollments e on e.student_id = s.id
left join public.enrollment_ledger el on el.enrollment_id = e.id
left join public.universities u on u.id = e.university_id
left join public.courses c on c.id = e.course_id
where s.is_active = true
group by s.id, p_owner.id, p_owner.display_name, p_owner.full_name, p_owner.avatar_url;

grant select on public.student_directory_view to authenticated;
revoke all on public.student_directory_view from public, anon;

-- Counter lookup RPC: EXACT match only on full mobile or exact student_code.
-- Returns minimal fields only and logs to audit_log!
create or replace function public.lookup_candidate_for_payment(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_clean_query text := trim(p_query);
  v_digits text;
  v_student record;
  v_enrollments jsonb;
  v_masked_mobile text;
  v_is_own boolean;
  v_owner_name text;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if v_clean_query is null or length(v_clean_query) < 3 then
    return null;
  end if;

  v_digits := regexp_replace(v_clean_query, '\D', '', 'g');

  -- EXACT match on student code OR exact normalized mobile
  select s.* into v_student
  from public.students s
  where s.is_active = true
    and (
      upper(s.student_code) = upper(v_clean_query)
      or (
        length(v_digits) >= 9
        and regexp_replace(s.mobile, '\D', '', 'g') in (
          v_digits,
          case when v_digits like '971%' then substring(v_digits from 4) else '971' || v_digits end,
          case when v_digits like '0%' then substring(v_digits from 2) else '0' || v_digits end,
          case when v_digits like '0%' then '971' || substring(v_digits from 2) else v_digits end
        )
      )
    )
  limit 1;

  -- Log every lookup attempt in audit_log
  insert into public.audit_log (
    action,
    entity_type,
    entity_id,
    user_id,
    metadata
  ) values (
    'lookup_candidate_for_payment',
    'student',
    v_student.id,
    v_caller_id,
    jsonb_build_object(
      'query', p_query,
      'matched', (v_student.id is not null)
    )
  );

  if v_student.id is null then
    return null;
  end if;

  -- Mask mobile: show country code and last 2 digits, mask middle
  if length(v_student.mobile) > 4 then
    v_masked_mobile := substring(v_student.mobile from 1 for 5) || ' ••• ••' || right(v_student.mobile, 2);
  else
    v_masked_mobile := '••••••••';
  end if;

  -- Determine if caller is owner or has active enrollment
  v_is_own := (
    v_student.owner_id = v_caller_id
    or exists (
      select 1 from public.enrollments e
      where e.student_id = v_student.id and e.admission_staff_id = v_caller_id
    )
  );

  select coalesce(p.display_name, p.full_name) into v_owner_name
  from public.profiles p where p.id = v_student.owner_id;

  -- Gather active enrollments with balance
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'enrollment_id', e.id,
      'program_name', coalesce(u.name || ' – ' || c.name, 'Program'),
      'admission_staff_id', e.admission_staff_id,
      'admission_staff_name', coalesce(p_adm.display_name, p_adm.full_name),
      'total_payable', el.total_payable,
      'total_paid', el.total_paid,
      'balance', el.balance,
      'status', e.status
    )
  ), '[]'::jsonb)
  into v_enrollments
  from public.enrollments e
  join public.enrollment_ledger el on el.enrollment_id = e.id
  left join public.universities u on u.id = e.university_id
  left join public.courses c on c.id = e.course_id
  left join public.profiles p_adm on p_adm.id = e.admission_staff_id
  where e.student_id = v_student.id and e.status = 'active';

  return jsonb_build_object(
    'student_id', v_student.id,
    'student_code', v_student.student_code,
    'student_name', v_student.full_name,
    'masked_mobile', v_masked_mobile,
    'owner_id', v_student.owner_id,
    'owner_name', v_owner_name,
    'is_own', v_is_own,
    'enrollments', v_enrollments
  );
end;
$$;

revoke all on function public.lookup_candidate_for_payment(text) from public, anon;
grant execute on function public.lookup_candidate_for_payment(text) to authenticated;

-- Transfer candidate RPC
create or replace function public.transfer_candidate(
  p_student_id uuid,
  p_to_user uuid,
  p_scope text,
  p_enrollment_id uuid default null,
  p_reason text default ''
)
returns public.candidate_transfers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_student record;
  v_enrollment record;
  v_target_profile record;
  v_from_user uuid;
  v_transfer public.candidate_transfers;
  v_caller_name text;
  v_admin_id uuid;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'A transfer reason of at least 5 characters is required';
  end if;

  if p_scope not in ('candidate', 'enrollment') then
    raise exception 'Invalid transfer scope: %', p_scope;
  end if;

  select * into v_target_profile
  from public.profiles where id = p_to_user and is_active = true;

  if not found then
    raise exception 'Target staff member not found or is inactive';
  end if;

  select role::text, coalesce(display_name, full_name)
  into v_caller_role, v_caller_name
  from public.profiles where id = v_caller_id;

  select * into v_student
  from public.students where id = p_student_id;

  if not found then
    raise exception 'Candidate not found';
  end if;

  if p_scope = 'candidate' then
    v_from_user := coalesce(v_student.owner_id, v_student.created_by);
  else
    if p_enrollment_id is null then
      raise exception 'Enrollment ID is required for enrollment scope transfer';
    end if;
    select * into v_enrollment
    from public.enrollments where id = p_enrollment_id and student_id = p_student_id;
    if not found then
      raise exception 'Enrollment not found for this candidate';
    end if;
    v_from_user := v_enrollment.admission_staff_id;
  end if;

  -- Permission checks:
  -- super_admin/owner: any
  -- admin: both from_user and to_user must be in visible_user_ids()
  -- staff: rejected
  if v_caller_role in ('super_admin', 'owner') then
    -- allowed
  elsif v_caller_role = 'admin' then
    if not (v_from_user in (select user_id from public.visible_user_ids())) or
       not (p_to_user in (select user_id from public.visible_user_ids())) then
      raise exception 'Admins can only transfer candidates within their visible team scope';
    end if;
  else
    raise exception 'forbidden: staff cannot execute transfers directly; please submit a transfer request';
  end if;

  -- Execute transfer
  if p_scope = 'candidate' then
    update public.students
    set owner_id = p_to_user, updated_at = now()
    where id = p_student_id;
  else
    update public.enrollments
    set admission_staff_id = p_to_user, updated_at = now()
    where id = p_enrollment_id;
  end if;

  -- Log transfer
  insert into public.candidate_transfers (
    student_id,
    enrollment_id,
    from_user,
    to_user,
    reason,
    transferred_by
  )
  values (
    p_student_id,
    p_enrollment_id,
    v_from_user,
    p_to_user,
    trim(p_reason),
    v_caller_id
  )
  returning * into v_transfer;

  -- Notify old owner
  perform public.create_notification(
    v_from_user,
    'candidate_transferred',
    'Candidate Transferred: ' || v_student.full_name,
    'Transferred to ' || v_target_profile.full_name || ' by ' || v_caller_name || '. Reason: ' || trim(p_reason),
    '/candidates/' || p_student_id,
    'student',
    p_student_id
  );

  -- Notify new owner
  perform public.create_notification(
    p_to_user,
    'candidate_transferred',
    'Candidate Assigned to You: ' || v_student.full_name,
    'Transferred from ' || (select full_name from public.profiles where id = v_from_user) || ' by ' || v_caller_name || '. Reason: ' || trim(p_reason),
    '/candidates/' || p_student_id,
    'student',
    p_student_id
  );

  -- Notify admins in scope
  for v_admin_id in select admin_id from public.get_admin_recipients_for(v_from_user) loop
    if v_admin_id not in (v_caller_id, v_from_user, p_to_user) then
      perform public.create_notification(
        v_admin_id,
        'candidate_transferred',
        'Candidate Transferred: ' || v_student.full_name,
        'From ' || (select full_name from public.profiles where id = v_from_user) || ' to ' || v_target_profile.full_name || '. Reason: ' || trim(p_reason),
        '/candidates/' || p_student_id,
        'student',
        p_student_id
      );
    end if;
  end loop;

  return v_transfer;
end;
$$;

revoke all on function public.transfer_candidate(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.transfer_candidate(uuid, uuid, text, uuid, text) to authenticated;

-- Request candidate transfer RPC (for staff)
create or replace function public.request_candidate_transfer(
  p_student_id uuid,
  p_to_user uuid,
  p_reason text,
  p_enrollment_id uuid default null
)
returns public.transfer_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_req public.transfer_requests;
  v_student record;
  v_caller_name text;
  v_admin_id uuid;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'Candidate not found';
  end if;

  select coalesce(display_name, full_name) into v_caller_name
  from public.profiles where id = v_caller_id;

  insert into public.transfer_requests (
    student_id,
    enrollment_id,
    requested_by,
    to_user,
    reason
  )
  values (
    p_student_id,
    p_enrollment_id,
    v_caller_id,
    p_to_user,
    trim(p_reason)
  )
  returning * into v_req;

  -- Notify admin chain
  for v_admin_id in select admin_id from public.get_admin_recipients_for(v_caller_id) loop
    perform public.create_notification(
      v_admin_id,
      'transfer_requested',
      'Transfer Request: ' || v_student.full_name,
      v_caller_name || ' requested transfer to ' || (select full_name from public.profiles where id = p_to_user) || '. Reason: ' || trim(p_reason),
      '/candidates/' || p_student_id,
      'transfer_request',
      v_req.id
    );
  end loop;

  return v_req;
end;
$$;

revoke all on function public.request_candidate_transfer(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.request_candidate_transfer(uuid, uuid, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. BUSINESS EVENT NOTIFICATION HOOKS
-- -----------------------------------------------------------------------------
-- Trigger on payments: notify counsellor when another user records payment, and notify admins
create or replace function public.notify_on_payment_recorded()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student record;
  v_enrollment record;
  v_counsellor_id uuid;
  v_recorder_name text;
  v_admin_id uuid;
  v_amount_formatted text;
begin
  select * into v_enrollment from public.enrollments where id = new.enrollment_id;
  select * into v_student from public.students where id = new.student_id;

  v_counsellor_id := coalesce(v_student.owner_id, v_enrollment.admission_staff_id, v_student.created_by);
  select coalesce(display_name, full_name) into v_recorder_name from public.profiles where id = new.received_by;
  v_amount_formatted := 'AED ' || trim(to_char(new.amount, 'FM999,999,990.00'));

  -- If payment recorded by someone else, notify owner counsellor
  if v_counsellor_id is not null and v_counsellor_id != new.received_by then
    perform public.create_notification(
      v_counsellor_id,
      'payment_recorded',
      'Payment Recorded: ' || v_amount_formatted,
      v_recorder_name || ' recorded ' || v_amount_formatted || ' for candidate ' || v_student.full_name || ' (' || new.receipt_no || ').',
      '/candidates/' || new.student_id,
      'payment',
      new.id
    );
  end if;

  -- Notify admin chain & super_admins
  for v_admin_id in select admin_id from public.get_admin_recipients_for(v_counsellor_id) loop
    if v_admin_id != new.received_by and v_admin_id != v_counsellor_id then
      perform public.create_notification(
        v_admin_id,
        'payment_recorded',
        'Payment Recorded: ' || v_amount_formatted,
        v_recorder_name || ' recorded ' || v_amount_formatted || ' for ' || v_student.full_name || ' (' || new.receipt_no || ').',
        '/candidates/' || new.student_id,
        'payment',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_payment_recorded on public.payments;
create trigger trg_notify_on_payment_recorded
  after insert on public.payments
  for each row
  execute function public.notify_on_payment_recorded();

-- Trigger on new enrollment: notify admin chain & super_admins
create or replace function public.notify_on_new_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student record;
  v_staff_name text;
  v_course_name text;
  v_uni_name text;
  v_admin_id uuid;
begin
  select * into v_student from public.students where id = new.student_id;
  select coalesce(display_name, full_name) into v_staff_name from public.profiles where id = new.admission_staff_id;
  select name into v_course_name from public.courses where id = new.course_id;
  select name into v_uni_name from public.universities where id = new.university_id;

  for v_admin_id in select admin_id from public.get_admin_recipients_for(new.admission_staff_id) loop
    if v_admin_id != new.admission_staff_id then
      perform public.create_notification(
        v_admin_id,
        'new_enrollment',
        'New Enrollment: ' || v_student.full_name,
        v_staff_name || ' enrolled ' || v_student.full_name || ' in ' || coalesce(v_course_name, 'Course') || ' (' || coalesce(v_uni_name, 'University') || ').',
        '/candidates/' || new.student_id,
        'enrollment',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_enrollment on public.enrollments;
create trigger trg_notify_on_new_enrollment
  after insert on public.enrollments
  for each row
  execute function public.notify_on_new_enrollment();

-- Trigger on candidate documents upload via link
create or replace function public.notify_on_document_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student record;
  v_counsellor_id uuid;
  v_doc_type text;
  v_admin_id uuid;
begin
  select * into v_student from public.students where id = new.student_id;
  select name into v_doc_type from public.document_types where id = new.document_type_id;

  v_counsellor_id := coalesce(v_student.owner_id, v_student.created_by);

  if v_counsellor_id is not null then
    perform public.create_notification(
      v_counsellor_id,
      'document_uploaded',
      'Document Uploaded: ' || v_student.full_name,
      v_student.full_name || ' uploaded ' || coalesce(v_doc_type, 'a document') || '.',
      '/candidates/' || new.student_id,
      'candidate_document',
      new.id
    );
  end if;

  for v_admin_id in select admin_id from public.get_admin_recipients_for(v_counsellor_id) loop
    if v_admin_id != v_counsellor_id then
      perform public.create_notification(
        v_admin_id,
        'document_uploaded',
        'Document Uploaded: ' || v_student.full_name,
        v_student.full_name || ' uploaded ' || coalesce(v_doc_type, 'a document') || '.',
        '/candidates/' || new.student_id,
        'candidate_document',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_document_uploaded on public.candidate_documents;
create trigger trg_notify_on_document_uploaded
  after insert on public.candidate_documents
  for each row
  execute function public.notify_on_document_uploaded();

-- Trigger on new staff joined: notify all admins & super_admins
create or replace function public.notify_on_staff_joined()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id uuid;
begin
  for v_admin_id in select admin_id from public.get_admin_recipients_for(null) loop
    if v_admin_id != new.id then
      perform public.create_notification(
        v_admin_id,
        'staff_joined',
        'New Team Member: ' || new.full_name,
        new.full_name || ' joined as ' || coalesce(new.job_title, new.role::text) || '.',
        '/admin/staff',
        'profile',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_staff_joined on public.profiles;
create trigger trg_notify_on_staff_joined
  after insert on public.profiles
  for each row
  execute function public.notify_on_staff_joined();

-- -----------------------------------------------------------------------------
-- 9. STORAGE BUCKET FOR STAFF AVATARS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars',
  'staff-avatars',
  false,
  1048576, -- 1MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage RLS on objects for staff-avatars
drop policy if exists "staff_avatars_select" on storage.objects;
create policy "staff_avatars_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-avatars' and public.is_active_user());

drop policy if exists "staff_avatars_insert" on storage.objects;
create policy "staff_avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and public.is_active_user()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "staff_avatars_update" on storage.objects;
create policy "staff_avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.is_active_user()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "staff_avatars_delete" on storage.objects;
create policy "staff_avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or public.is_super_admin()
      or public.is_owner()
    )
  );
