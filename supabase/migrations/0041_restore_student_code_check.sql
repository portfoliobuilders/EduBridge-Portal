alter table public.students drop constraint if exists students_student_code_format_check;
alter table public.students add constraint students_student_code_format_check
  check (student_code ~ '^EB-STU-[0-9]{5}$') not valid;
