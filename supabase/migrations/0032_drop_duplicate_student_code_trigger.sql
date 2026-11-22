-- ==============================================================================
-- Migration: 0032_drop_duplicate_student_code_trigger.sql
-- Description: Drop legacy duplicate trigger trg_students_code_gen to avoid double execution
-- ==============================================================================

drop trigger if exists trg_students_code_gen on public.students;
