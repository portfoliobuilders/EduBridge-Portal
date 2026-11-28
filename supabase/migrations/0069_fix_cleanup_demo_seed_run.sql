-- 0069_fix_cleanup_demo_seed_run.sql
-- Fix audit_log column reference (actor / user_id instead of actor_id) in cleanup_demo_seed_run.

CREATE OR REPLACE FUNCTION public.cleanup_demo_seed_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_manifest jsonb;
  v_student_ids uuid[];
  v_user_ids uuid[];
  v_punch_ids uuid[];
  v_day_ids uuid[];
  v_leave_ids uuid[];
  v_reg_ids uuid[];
  v_holiday_ids uuid[];
  v_notif_ids uuid[];
  v_spec_ids uuid[];
  v_course_ids uuid[];
  v_uni_ids uuid[];
BEGIN
  SELECT manifest INTO v_manifest
  FROM public.demo_seed_runs
  WHERE id = p_run_id AND cleaned_at IS NULL;

  IF v_manifest IS NULL THEN
    RETURN jsonb_build_object('cleaned', false, 'reason', 'not_found_or_already_cleaned');
  END IF;

  SET LOCAL app.allow_test_data_cleanup = 'true';
  SET LOCAL app.allow_test_cleanup = 'on';

  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_student_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'student_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_user_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'user_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_punch_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'punch_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_day_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'day_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_leave_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'leave_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_reg_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'regularization_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_holiday_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'holiday_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_notif_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'notification_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_spec_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'specialization_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_course_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'course_ids', '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_uni_ids FROM jsonb_array_elements_text(COALESCE(v_manifest->'university_ids', '[]'::jsonb)) x;

  -- Notifications
  IF array_length(v_notif_ids, 1) > 0 THEN
    DELETE FROM public.notifications WHERE id = ANY(v_notif_ids);
  END IF;
  IF array_length(v_user_ids, 1) > 0 THEN
    DELETE FROM public.notifications WHERE user_id = ANY(v_user_ids);
  END IF;

  -- Candidates, enrollments, payments, documents
  IF array_length(v_student_ids, 1) > 0 THEN
    DELETE FROM public.document_access_log
      WHERE document_id IN (SELECT id FROM public.candidate_documents WHERE student_id = ANY(v_student_ids));
    ALTER TABLE public.candidate_documents DISABLE TRIGGER trg_prevent_candidate_document_delete;
    DELETE FROM public.candidate_documents WHERE student_id = ANY(v_student_ids);
    ALTER TABLE public.candidate_documents ENABLE TRIGGER trg_prevent_candidate_document_delete;
    DELETE FROM public.document_upload_links WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.share_logs
      WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE student_id = ANY(v_student_ids));
    DELETE FROM public.audit_log
      WHERE row_id = ANY(v_student_ids)
         OR row_id IN (SELECT id FROM public.enrollments WHERE student_id = ANY(v_student_ids))
         OR row_id IN (SELECT id FROM public.payments WHERE student_id = ANY(v_student_ids));
    DELETE FROM public.payments WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.enrollments WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.student_addresses WHERE student_id = ANY(v_student_ids);
    DELETE FROM public.students WHERE id = ANY(v_student_ids);
  END IF;

  -- Attendance (punches via guarded cleanup flag)
  IF array_length(v_punch_ids, 1) > 0 THEN
    DELETE FROM public.attendance_punches WHERE id = ANY(v_punch_ids);
  END IF;
  IF array_length(v_day_ids, 1) > 0 THEN
    DELETE FROM public.attendance_days WHERE id = ANY(v_day_ids);
  END IF;
  IF array_length(v_leave_ids, 1) > 0 THEN
    DELETE FROM public.leave_requests WHERE id = ANY(v_leave_ids);
  END IF;
  IF array_length(v_reg_ids, 1) > 0 THEN
    DELETE FROM public.regularization_requests WHERE id = ANY(v_reg_ids);
  END IF;
  IF array_length(v_holiday_ids, 1) > 0 THEN
    DELETE FROM public.holidays WHERE id = ANY(v_holiday_ids);
  END IF;

  -- Demo user attendance & settings
  IF array_length(v_user_ids, 1) > 0 THEN
    DELETE FROM public.attendance_punches WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.attendance_days WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.leave_requests WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.regularization_requests WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.staff_attendance_settings WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.audit_log WHERE actor = ANY(v_user_ids) OR user_id = ANY(v_user_ids);
  END IF;

  -- Programs
  IF array_length(v_spec_ids, 1) > 0 THEN
    DELETE FROM public.specializations WHERE id = ANY(v_spec_ids);
  END IF;
  IF array_length(v_course_ids, 1) > 0 THEN
    DELETE FROM public.courses WHERE id = ANY(v_course_ids);
  END IF;
  IF array_length(v_uni_ids, 1) > 0 THEN
    DELETE FROM public.universities WHERE id = ANY(v_uni_ids);
  END IF;

  UPDATE public.demo_seed_runs SET cleaned_at = now() WHERE id = p_run_id;

  RETURN jsonb_build_object('cleaned', true, 'run_id', p_run_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_demo_seed_run(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_demo_seed_run(uuid) TO service_role;
