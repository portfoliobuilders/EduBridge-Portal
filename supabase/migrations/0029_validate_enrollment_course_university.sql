-- ============================================================================
-- Migration: 0029_validate_enrollment_course_university.sql
-- Description: Enforce that enrollment course belongs to the selected university.
-- ============================================================================

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
  -- Integrity check: course must belong to the selected university
  if not exists (
    select 1 from public.courses
    where id = new.course_id and university_id = new.university_id
  ) then
    raise exception 'Course does not belong to the selected university';
  end if;

  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id then
      raise exception 'student_id cannot be changed';
    end if;

    select count(*), coalesce(sum(amount), 0)
    into v_payment_count, v_total_paid
    from public.payments
    where enrollment_id = old.id
      and status = 'valid';

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
