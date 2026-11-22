-- Migration 0020: Add super_admin and admin values to app_role enum
-- ============================================================================
alter type app_role add value if not exists 'super_admin';
alter type app_role add value if not exists 'admin';
