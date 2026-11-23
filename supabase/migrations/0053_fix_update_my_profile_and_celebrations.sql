-- ==============================================================================
-- Migration: 0053_fix_update_my_profile_and_celebrations.sql
-- Description:
--   1. Fix update_my_profile to update public.profiles (non-sensitive)
--      and upsert into public.staff_sensitive_details (sensitive).
--   2. Fix process_daily_celebrations to join public.staff_sensitive_details
--      for personal_email (which was dropped from public.profiles in 0042).
-- ==============================================================================

-- 1. Fix update_my_profile RPC
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
    avatar_url = coalesce(p_avatar_url, avatar_url),
    celebrate_birthday = coalesce(p_celebrate_birthday, celebrate_birthday),
    celebrate_anniversary = coalesce(p_celebrate_anniversary, celebrate_anniversary),
    email_digest_enabled = coalesce(p_email_digest_enabled, email_digest_enabled),
    updated_at = now()
  where id = v_uid
  returning * into v_updated;

  -- Upsert sensitive details in staff_sensitive_details if any provided
  if p_personal_email is not null or p_dob is not null or p_address is not null
     or p_emergency_contact_name is not null or p_emergency_contact_phone is not null then
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
      v_uid,
      p_personal_email,
      p_dob,
      p_address,
      p_emergency_contact_name,
      p_emergency_contact_phone,
      now()
    )
    on conflict (user_id) do update set
      personal_email = coalesce(excluded.personal_email, staff_sensitive_details.personal_email),
      dob = coalesce(excluded.dob, staff_sensitive_details.dob),
      address = coalesce(excluded.address, staff_sensitive_details.address),
      emergency_contact_name = coalesce(excluded.emergency_contact_name, staff_sensitive_details.emergency_contact_name),
      emergency_contact_phone = coalesce(excluded.emergency_contact_phone, staff_sensitive_details.emergency_contact_phone),
      updated_at = now();
  end if;

  return v_updated;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, date, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text, date, text, text, text, text, boolean, boolean, boolean) to authenticated;

-- 2. Fix process_daily_celebrations
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

    -- Append to output json (joining staff_sensitive_details for personal_email)
    v_results := v_results || jsonb_build_object(
      'user_id', v_cel.user_id,
      'full_name', v_cel.full_name,
      'first_name', v_cel.first_name,
      'kind', v_cel.kind,
      'years', v_cel.years,
      'email', (
        select coalesce(p.work_email, ssd.personal_email)
        from public.profiles p
        left join public.staff_sensitive_details ssd on ssd.user_id = p.id
        where p.id = v_cel.user_id
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.process_daily_celebrations(date) from public, anon, authenticated;
grant execute on function public.process_daily_celebrations(date) to service_role;
