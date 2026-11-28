-- 0067_perf_indexes_and_demo_runs.sql
-- Missing performance indexes for attendance, audit/share logs, and candidate detail views,
-- plus demo_seed_runs tracking table for idempotent demo data seeding/cleanup.

-- 1. Attendance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_punches_user_at
  ON public.attendance_punches (user_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_at
  ON public.attendance_punches (at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_pending
  ON public.attendance_punches (created_at DESC)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_attendance_days_date
  ON public.attendance_days (date);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates
  ON public.leave_requests (user_id, from_date, to_date);

CREATE INDEX IF NOT EXISTS idx_leave_requests_pending
  ON public.leave_requests (created_at DESC)
  WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS idx_regularization_requests_user_date
  ON public.regularization_requests (user_id, date);

CREATE INDEX IF NOT EXISTS idx_regularization_requests_pending
  ON public.regularization_requests (created_at DESC)
  WHERE status = 'requested';

-- 2. Candidate detail & activity timeline indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_table_row_at
  ON public.audit_log (table_name, row_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_share_logs_enrollment_sent
  ON public.share_logs (enrollment_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_addresses_student
  ON public.student_addresses (student_id, created_at);

CREATE INDEX IF NOT EXISTS idx_document_upload_links_student
  ON public.document_upload_links (student_id, created_at DESC);

-- 3. Demo seed tracking table (service-role only)
CREATE TABLE IF NOT EXISTS public.demo_seed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cleaned_at timestamptz,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.demo_seed_runs ENABLE ROW LEVEL SECURITY;
