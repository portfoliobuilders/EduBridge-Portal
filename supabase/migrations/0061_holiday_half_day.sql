-- Migration: 0061_holiday_half_day.sql
-- Description: Add half_day flag to public.holidays table

alter table public.holidays add column if not exists half_day boolean not null default false;
