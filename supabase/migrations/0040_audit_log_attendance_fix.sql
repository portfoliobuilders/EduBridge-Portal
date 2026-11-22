-- ============================================================================
-- Migration: 0040_audit_log_attendance_fix.sql
-- Description:
-- 1. Fix audit_log column names in approve_regularization (table_name, row_id, action, actor, at, diff)
-- 2. Add audit_log trigger on staff_attendance_settings changes
-- ============================================================================

-- 1. Fix approve_regularization
create or replace function public.approve_regularization(
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_reg record;
  v_worked_minutes integer;
  v_settings record;
  v_shift_start_ts timestamptz;
  v_late_minutes integer := 0;
  v_status text := 'present';
  v_tz text := 'Asia/Dubai';
  v_comp record;
  v_min_full integer := 480;
  v_min_half integer := 240;
begin
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  if v_caller_role not in ('admin', 'super_admin', 'owner') then
    return jsonb_build_object('success', false, 'error', 'Admin authorization required');
  end if;

  select * into v_reg from public.regularization_requests where id = p_request_id;
  if v_reg.id is null then
    return jsonb_build_object('success', false, 'error', 'Regularization request not found');
  end if;

  if v_reg.status != 'requested' then
    return jsonb_build_object('success', false, 'error', 'Regularization request has already been processed');
  end if;

  select * into v_comp from public.company_settings limit 1;
  v_tz := coalesce(v_comp.attendance_timezone, 'Asia/Dubai');
  v_min_full := round(coalesce(v_comp.attendance_min_hours_full_day, 8.00) * 60);
  v_min_half := round(coalesce(v_comp.attendance_min_hours_half_day, 4.00) * 60);

  if p_action = 'approve' then
    update public.regularization_requests
    set status = 'approved',
        approver_id = v_caller_id,
        action_reason = p_reason,
        updated_at = now()
    where id = p_request_id;

    v_worked_minutes := round(extract(epoch from (v_reg.requested_out - v_reg.requested_in)) / 60.0)::integer;

    select * into v_settings from public.staff_attendance_settings where user_id = v_reg.user_id;
    if v_settings.shift_start is not null then
      v_shift_start_ts := (v_reg.date::text || ' ' || v_settings.shift_start::text)::timestamp at time zone v_tz;
      if v_reg.requested_in > (v_shift_start_ts + (coalesce(v_settings.grace_minutes, 15) * interval '1 minute')) then
        v_late_minutes := round(extract(epoch from (v_reg.requested_in - v_shift_start_ts)) / 60.0)::integer;
      end if;
    end if;

    if v_worked_minutes >= v_min_full then
      if v_late_minutes > 0 then
        v_status := 'late';
      else
        v_status := 'present';
      end if;
    elsif v_worked_minutes >= v_min_half then
      v_status := 'half_day';
    else
      v_status := 'half_day';
    end if;

    insert into public.attendance_days (
      user_id,
      date,
      first_in,
      last_out,
      worked_minutes,
      status,
      late_minutes,
      regularized,
      regularization_id,
      updated_at
    ) values (
      v_reg.user_id,
      v_reg.date,
      v_reg.requested_in,
      v_reg.requested_out,
      v_worked_minutes,
      v_status,
      v_late_minutes,
      true,
      v_reg.id,
      now()
    )
    on conflict (user_id, date) do update set
      first_in = excluded.first_in,
      last_out = excluded.last_out,
      worked_minutes = excluded.worked_minutes,
      status = excluded.status,
      late_minutes = excluded.late_minutes,
      regularized = true,
      regularization_id = excluded.regularization_id,
      updated_at = now();

    -- Log to audit_log with correct schema columns
    insert into public.audit_log (
      table_name,
      row_id,
      action,
      actor,
      at,
      diff
    ) values (
      'regularization_requests',
      p_request_id,
      'approve_regularization',
      v_caller_id,
      now(),
      jsonb_build_object(
        'target_user_id', v_reg.user_id,
        'date', v_reg.date,
        'worked_minutes', v_worked_minutes,
        'status', v_status
      )
    );

    perform public.create_notification(
      v_reg.user_id,
      'regularization_approved',
      'Attendance Regularization Approved',
      format('Your attendance correction for %s was approved.', v_reg.date),
      '/attendance',
      'regularization_request',
      p_request_id
    );
  elsif p_action = 'reject' then
    update public.regularization_requests
    set status = 'rejected',
        approver_id = v_caller_id,
        action_reason = p_reason,
        updated_at = now()
    where id = p_request_id;

    perform public.create_notification(
      v_reg.user_id,
      'regularization_rejected',
      'Attendance Regularization Rejected',
      format('Your attendance correction for %s was rejected: %s', v_reg.date, coalesce(p_reason, 'No reason provided')),
      '/attendance',
      'regularization_request',
      p_request_id
    );
  else
    return jsonb_build_object('success', false, 'error', 'Invalid action: must be approve or reject');
  end if;

  return jsonb_build_object('success', true, 'status', p_action);
end;
$$;

-- 2. Audit log trigger for staff attendance settings changes
create or replace function public.trg_audit_staff_attendance_settings()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    insert into public.audit_log (
      table_name,
      row_id,
      action,
      actor,
      at,
      diff
    ) values (
      'staff_attendance_settings',
      new.user_id,
      'update_staff_attendance_settings',
      v_actor,
      now(),
      jsonb_build_object(
        'old_office_id', old.office_id,
        'new_office_id', new.office_id,
        'old_shift_start', old.shift_start,
        'new_shift_start', new.shift_start,
        'old_shift_end', old.shift_end,
        'new_shift_end', new.shift_end,
        'old_allow_field_punch', old.allow_field_punch,
        'new_allow_field_punch', new.allow_field_punch,
        'old_attendance_required', old.attendance_required,
        'new_attendance_required', new.attendance_required
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_staff_attendance_settings on public.staff_attendance_settings;
create trigger audit_staff_attendance_settings
after update on public.staff_attendance_settings
for each row execute function public.trg_audit_staff_attendance_settings();
