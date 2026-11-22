SELECT 'notifications_to_real_users' AS metric, count(*)
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE p.work_email NOT LIKE '%@test.edubridge.local'
  AND (n.title ILIKE '%test%' OR n.body ILIKE '%test%')
UNION ALL
SELECT 'celebration_wishes_total', count(*) FROM celebration_wishes
UNION ALL
SELECT 'staff_sensitive_details_total', count(*) FROM staff_sensitive_details
UNION ALL
SELECT 'test_avatars', count(*) FROM profiles WHERE avatar_url LIKE '%test%';
