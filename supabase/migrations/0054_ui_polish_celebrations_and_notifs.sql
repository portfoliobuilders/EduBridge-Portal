-- ==============================================================================
-- Migration: 0054_ui_polish_celebrations_and_notifs.sql
-- Description:
--   1. Master celebration switch on company_settings (default false).
--   2. Enforce master switch in get_celebrations_today, get_upcoming_celebrations_this_week,
--      process_daily_celebrations, and send_celebration_wish.
--   3. Guard profiles trigger so staff and self cannot modify celebration exclusion.
--   4. Prevent test users from firing notify_on_staff_joined notifications.
--   5. Guard reports_to to require active staff.
-- ==============================================================================

-- 1. Master celebration switch
alter table public.company_settings
  add column if not exists celebrations_enabled boolean not null default false;

-- 2. Update get_celebrations_today
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
  v_master_enabled boolean;
begin
  -- Check master switch
  select coalesce(celebrations_enabled, false) into v_master_enabled
  from public.company_settings
  where singleton = true;

  if not coalesce(v_master_enabled, false) then
    return;
  end if;

  v_is_leap_year := (extract(year from v_today)::int % 4 = 0 and (extract(year from v_today)::int % 100 != 0 or extract(year from v_today)::int % 400 = 0));

  return query
  -- 1. Birthdays today (strictly active staff with DOB set and celebrate_birthday = true)
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
  left join public.staff_sensitive_details ssd on ssd.user_id = p.id
  where p.is_active = true
    and p.celebrate_birthday = true
    and ssd.dob is not null
    and (
      (extract(month from ssd.dob)::int = v_cur_month and extract(day from ssd.dob)::int = v_cur_day)
      or (not v_is_leap_year and v_cur_month = 2 and v_cur_day = 28 and extract(month from ssd.dob)::int = 2 and extract(day from ssd.dob)::int = 29)
    )

  union all

  -- 2. Work anniversaries today (strictly active staff with joining_date >= 1 year and celebrate_anniversary = true)
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

-- 3. Update get_upcoming_celebrations_this_week
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
  v_master_enabled boolean;
begin
  -- Check master switch
  select coalesce(celebrations_enabled, false) into v_master_enabled
  from public.company_settings
  where singleton = true;

  if not coalesce(v_master_enabled, false) then
    return;
  end if;

  return query
  with upcoming as (
    -- Birthdays in the next 7 days (days_away 1..7)
    select
      p.id as user_id,
      p.full_name,
      p.avatar_url,
      'birthday'::text as kind,
      (
        case
          when make_date(v_cur_year, extract(month from ssd.dob)::int, extract(day from ssd.dob)::int) >= v_today
          then make_date(v_cur_year, extract(month from ssd.dob)::int, extract(day from ssd.dob)::int)
          else make_date(v_cur_year + 1, extract(month from ssd.dob)::int, extract(day from ssd.dob)::int)
        end
      ) as target_date,
      null::int as years
    from public.profiles p
    left join public.staff_sensitive_details ssd on ssd.user_id = p.id
    where p.is_active = true
      and p.celebrate_birthday = true
      and ssd.dob is not null

    union all

    -- Anniversaries in the next 7 days (days_away 1..7)
    select
      p.id as user_id,
      p.full_name,
      p.avatar_url,
      'anniversary'::text as kind,
      (
        case
          when make_date(v_cur_year, extract(month from p.joining_date)::int, extract(day from p.joining_date)::int) >= v_today
          then make_date(v_cur_year, extract(month from p.joining_date)::int, extract(day from p.joining_date)::int)
          else make_date(v_cur_year + 1, extract(month from p.joining_date)::int, extract(day from p.joining_date)::int)
        end
      ) as target_date,
      (v_cur_year - extract(year from p.joining_date)::int) as years
    from public.profiles p
    where p.is_active = true
      and p.celebrate_anniversary = true
      and p.joining_date is not null
      and (v_cur_year - extract(year from p.joining_date)::int) >= 1
  )
  select
    u.user_id,
    u.full_name,
    u.avatar_url,
    u.kind,
    to_char(u.target_date, 'Mon DD') as celebration_date,
    (u.target_date - v_today)::int as days_away,
    u.years
  from upcoming u
  where (u.target_date - v_today) between 1 and 7
  order by (u.target_date - v_today) asc, u.full_name asc;
end;
$$;

revoke all on function public.get_upcoming_celebrations_this_week() from public, anon;
grant execute on function public.get_upcoming_celebrations_this_week() to authenticated;

-- 4. Update process_daily_celebrations
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
  v_master_enabled boolean;
begin
  -- Check master switch
  select coalesce(celebrations_enabled, false) into v_master_enabled
  from public.company_settings
  where singleton = true;

  if not coalesce(v_master_enabled, false) then
    return '[]'::jsonb;
  end if;

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
            'Work Anniversary Today: ' || v_cel.full_name || ' 🎉',
            v_cel.full_name || ' is celebrating ' || v_cel.years || ' year' || (case when v_cel.years > 1 then 's' else '' end) || ' with EduBridge today!',
            '/',
            'profile',
            v_cel.user_id
          );
        end if;
      end loop;
    end if;

    v_results := v_results || jsonb_build_object(
      'user_id', v_cel.user_id,
      'kind', v_cel.kind,
      'full_name', v_cel.full_name
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.process_daily_celebrations(date) from public, anon;
grant execute on function public.process_daily_celebrations(date) to authenticated;

-- 5. Update send_celebration_wish
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
  v_master_enabled boolean;
begin
  if v_caller_id is null or not public.is_active_user() then
    raise exception 'Unauthorized';
  end if;

  select coalesce(celebrations_enabled, false) into v_master_enabled
  from public.company_settings
  where singleton = true;

  if not coalesce(v_master_enabled, false) then
    raise exception 'Celebrations are currently disabled';
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
    recipient_id,
    sender_id,
    kind,
    year,
    message
  ) values (
    p_celebrant_id,
    v_caller_id,
    p_kind,
    v_year,
    trim(p_message)
  )
  returning * into v_wish;

  -- Send notification to the celebrant
  perform public.create_notification(
    p_celebrant_id,
    case when p_kind = 'birthday' then 'celebration_birthday' else 'celebration_anniversary' end,
    'New Wish from ' || v_sender_name,
    v_sender_name || ' sent you a wish: "' || trim(p_message) || '"',
    '/',
    'wish',
    v_wish.id
  );

  return v_wish;
end;
$$;

revoke all on function public.send_celebration_wish(uuid, text, text) from public, anon;
grant execute on function public.send_celebration_wish(uuid, text, text) to authenticated;

-- 6. Update notify_on_staff_joined to prevent firing for test users
create or replace function public.notify_on_staff_joined()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id uuid;
  v_user_email text;
begin
  -- Exclude test users by work email
  if coalesce(new.work_email, '') like '%@test.edubridge.local' or coalesce(new.work_email, '') like '%@example.com' then
    return new;
  end if;

  -- Exclude test users by auth email
  select email into v_user_email from auth.users where id = new.id;
  if coalesce(v_user_email, '') like '%@test.edubridge.local' or coalesce(v_user_email, '') like '%@example.com' then
    return new;
  end if;

  -- Exclude automated test user names
  if coalesce(new.full_name, '') ilike '%test%' or
     coalesce(new.full_name, '') ilike '%auditor%' or
     coalesce(new.full_name, '') ilike 'smoke staff%' or
     coalesce(new.full_name, '') ilike 'doc staff%' or
     coalesce(new.full_name, '') ilike 'crawl %' then
    return new;
  end if;

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

-- 7. Update trg_guard_profiles_update
create or replace function public.trg_guard_profiles_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
begin
  v_caller_id := auth.uid();

  -- If background service role (e.g. auth migration, test runner service role), allow
  if v_caller_id is null then
    return new;
  end if;

  select role::text into v_caller_role
  from public.profiles
  where id = v_caller_id and is_active = true;

  if v_caller_role is null then
    raise exception 'forbidden: caller profile not found or inactive';
  end if;

  -- 1. SUPER_ADMIN / OWNER: full privileges except cannot demote or deactivate the last active super_admin
  if v_caller_role in ('super_admin', 'owner') then
    if old.role::text in ('super_admin', 'owner') and old.is_active = true and
       (new.role::text not in ('super_admin', 'owner') or new.is_active = false) then
      if (select count(*) from public.profiles where role in ('super_admin', 'owner') and is_active = true and id != old.id) < 1 then
        raise exception 'forbidden: cannot deactivate or demote the last active super_admin';
      end if;
    end if;

    -- If reports_to changed, target must be an active staff member
    if new.reports_to is distinct from old.reports_to and new.reports_to is not null then
      if not exists (select 1 from public.profiles where id = new.reports_to and is_active = true) then
        raise exception 'forbidden: reports_to must be an active staff member';
      end if;
    end if;

    return new;
  end if;

  -- 2. ADMIN: strictly scoped
  if v_caller_role = 'admin' then
    -- Admin updating their own profile: CANNOT modify administrative or celebration fields
    if old.id = v_caller_id then
      if (new.role is distinct from old.role) or
         (new.admin_scope is distinct from old.admin_scope) or
         (new.reports_to is distinct from old.reports_to) or
         (new.is_active is distinct from old.is_active) or
         (new.is_support is distinct from old.is_support) or
         (new.work_email is distinct from old.work_email) or
         (new.job_title is distinct from old.job_title) or
         (new.employee_id is distinct from old.employee_id) or
         (new.joining_date is distinct from old.joining_date) or
         (new.celebrate_birthday is distinct from old.celebrate_birthday) or
         (new.celebrate_anniversary is distinct from old.celebrate_anniversary) then
        raise exception 'forbidden: admins cannot modify own administrative or privileged fields';
      end if;
      return new;
    end if;

    -- Admin updating another profile
    -- Must only update staff members (cannot edit other admins or super_admins)
    if old.role::text != 'staff' then
      raise exception 'forbidden: admins can only manage staff members';
    end if;

    -- Must be within admin's visible scope
    if not (old.id in (select user_id from public.visible_user_ids())) then
      raise exception 'forbidden: staff member is outside your administrative scope';
    end if;

    -- Cannot change role (no promotion to admin/super_admin)
    if new.role is distinct from old.role then
      raise exception 'forbidden: admins cannot change roles';
    end if;

    -- Cannot change admin_scope, is_support, work_email
    if new.admin_scope is distinct from old.admin_scope then
      raise exception 'forbidden: admins cannot configure admin scope';
    end if;

    if new.is_support is distinct from old.is_support then
      raise exception 'forbidden: admins cannot configure support flag';
    end if;

    if new.work_email is distinct from old.work_email then
      raise exception 'forbidden: admins cannot change work email';
    end if;

    -- reports_to can only be set to someone within visible scope (or null) AND must be active
    if new.reports_to is distinct from old.reports_to and new.reports_to is not null then
      if not (new.reports_to in (select user_id from public.visible_user_ids())) then
        raise exception 'forbidden: cannot assign reports_to outside your administrative scope';
      end if;
      if not exists (select 1 from public.profiles where id = new.reports_to and is_active = true) then
        raise exception 'forbidden: reports_to must be an active staff member';
      end if;
    end if;

    -- Allowed fields for admin on staff: job_title, employee_id, joining_date, reports_to (in scope), is_active, celebrate_birthday, celebrate_anniversary
    return new;
  end if;

  -- 3. STAFF / OTHER ROLES
  if old.id != v_caller_id then
    raise exception 'forbidden: staff cannot modify other profiles';
  end if;

  if (new.job_title is distinct from old.job_title) or
     (new.employee_id is distinct from old.employee_id) or
     (new.joining_date is distinct from old.joining_date) or
     (new.role is distinct from old.role) or
     (new.admin_scope is distinct from old.admin_scope) or
     (new.reports_to is distinct from old.reports_to) or
     (new.is_active is distinct from old.is_active) or
     (new.is_support is distinct from old.is_support) or
     (new.work_email is distinct from old.work_email) or
     (new.celebrate_birthday is distinct from old.celebrate_birthday) or
     (new.celebrate_anniversary is distinct from old.celebrate_anniversary) then
    raise exception 'forbidden: staff cannot modify administrative or celebration settings';
  end if;

  return new;
end;
$$;
