-- =============================================================================
-- Seed: 3 Sample Universities, 2 Courses each, 2 Specializations each
-- All marked with ' (SAMPLE)' so the owner can easily identify and archive them
-- =============================================================================

do $$
declare
  v_uni1 uuid;
  v_uni2 uuid;
  v_uni3 uuid;
  v_c1_1 uuid;
  v_c1_2 uuid;
  v_c2_1 uuid;
  v_c2_2 uuid;
  v_c3_1 uuid;
  v_c3_2 uuid;
begin
  -- University 1
  insert into universities (name, country, is_active)
  values ('Middlesex University Dubai (SAMPLE)', 'UAE', true)
  returning id into v_uni1;

  insert into courses (university_id, name, level, duration, default_fee, is_active)
  values (v_uni1, 'BSc Computer Science (SAMPLE)', 'Bachelor', '3 Years', 58000.00, true)
  returning id into v_c1_1;

  insert into courses (university_id, name, level, duration, default_fee, is_active)
  values (v_uni1, 'MBA Global Executive (SAMPLE)', 'Master', '1 Year', 75000.00, true)
  returning id into v_c1_2;

  insert into specializations (course_id, name, default_fee, is_active)
  values
    (v_c1_1, 'Artificial Intelligence (SAMPLE)', 60000.00, true),
    (v_c1_1, 'Cyber Security (SAMPLE)', 59000.00, true),
    (v_c1_2, 'Finance & Banking (SAMPLE)', 78000.00, true),
    (v_c1_2, 'Marketing Strategy (SAMPLE)', 75000.00, true);

  -- University 2
  insert into universities (name, country, is_active)
  values ('Heriot-Watt University Dubai (SAMPLE)', 'UAE', true)
  returning id into v_uni2;

  insert into courses (university_id, name, level, duration, default_fee, is_active)
  values (v_uni2, 'BBA International Business (SAMPLE)', 'Bachelor', '3 Years', 52000.00, true)
  returning id into v_c2_1;

  insert into courses (university_id, name, level, duration, default_fee, is_active)
  values (v_uni2, 'MSc Data Science (SAMPLE)', 'Master', '1 Year', 68000.00, true)
  returning id into v_c2_2;

  insert into specializations (course_id, name, default_fee, is_active)
  values
    (v_c2_1, 'Supply Chain Management (SAMPLE)', 54000.00, true),
    (v_c2_1, 'Digital Marketing (SAMPLE)', 52000.00, true),
    (v_c2_2, 'Machine Learning & Big Data (SAMPLE)', 70000.00, true),
    (v_c2_2, 'Business Analytics (SAMPLE)', 68000.00, true);

  -- University 3
  insert into universities (name, country, is_active)
  values ('University of Wollongong in Dubai (SAMPLE)', 'UAE', true)
  returning id into v_uni3;

  insert into courses (university_id, name, level, duration, default_fee, is_active)
  values (v_uni3, 'Bachelor of Nursing (SAMPLE)', 'Bachelor', '4 Years', 48000.00, true)
  returning id into v_c3_1;

  insert into courses (university_id, name, level, duration, default_fee, is_active)
  values (v_uni3, 'Master of Engineering Management (SAMPLE)', 'Master', '2 Years', 62000.00, true)
  returning id into v_c3_2;

  insert into specializations (course_id, name, default_fee, is_active)
  values
    (v_c3_1, 'Clinical Care (SAMPLE)', 49000.00, true),
    (v_c3_1, 'Community Health (SAMPLE)', 48000.00, true),
    (v_c3_2, 'Construction Project Management (SAMPLE)', 65000.00, true),
    (v_c3_2, 'Industrial Systems (SAMPLE)', 62000.00, true);
end $$;
