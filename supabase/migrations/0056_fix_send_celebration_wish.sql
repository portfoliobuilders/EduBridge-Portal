-- ==============================================================================
-- Migration: 0054_fix_send_celebration_wish.sql
-- Description:
--   Restores correct column names (celebrant_id, from_user) in send_celebration_wish.
-- ==============================================================================

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
    celebrant_id,
    from_user,
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
