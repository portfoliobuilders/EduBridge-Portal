-- Migration: 0057_sensitive_details_rpc_and_staff_joined_filter.sql
-- 1. SECURITY DEFINER RPC for updating staff_sensitive_details with strict permission checks:
--    - super_admin: all
--    - admin: staff in visible_user_ids() only (never another admin or a super_admin)
--    - self: caller updating their own details
-- 2. Update notify_on_staff_joined: filter ONLY on email domain @test.edubridge.local (no name patterns, no @example.com).

create or replace function public.update_staff_sensitive_details(
  p_user_id uuid,
  p_personal_email text default null,
  p_dob date default null,
  p_address text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  -- Permission enforcement:
  -- - super_admin can manage anyone
  -- - admin can only manage staff in visible_user_ids() (can_manage_user enforces: target must be 'staff' and in visible_user_ids())
  -- - caller can update their own sensitive details
  if not (
    public.is_super_admin()
    or public.can_manage_user(p_user_id)
    or (v_caller_id = p_user_id)
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: caller cannot manage sensitive details for this user');
  end if;

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
    p_user_id,
    p_personal_email,
    p_dob,
    p_address,
    p_emergency_contact_name,
    p_emergency_contact_phone,
    now()
  )
  on conflict (user_id) do update set
    personal_email = excluded.personal_email,
    dob = excluded.dob,
    address = excluded.address,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.update_staff_sensitive_details(uuid, text, date, text, text, text) from public, anon;
grant execute on function public.update_staff_sensitive_details(uuid, text, date, text, text, text) to authenticated;

-- 2. Update notify_on_staff_joined: filter ONLY on email domain @test.edubridge.local
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
  if coalesce(new.work_email, '') like '%@test.edubridge.local' then
    return new;
  end if;

  -- Exclude test users by auth email
  select email into v_user_email from auth.users where id = new.id;
  if coalesce(v_user_email, '') like '%@test.edubridge.local' then
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
