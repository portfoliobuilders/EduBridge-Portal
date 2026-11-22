-- Select query displaying Joe Tom's dashboard metrics
with params as (
  select 
    '9bfbe83e-ca82-4492-b61e-74998beec546'::uuid as joe_id,
    (timezone('Asia/Dubai', now())::date || ' 00:00:00+04')::timestamptz as today_start,
    (timezone('Asia/Dubai', now())::date || ' 23:59:59.999+04')::timestamptz as today_end,
    (date_trunc('month', timezone('Asia/Dubai', now()))::date || ' 00:00:00+04')::timestamptz as month_start
)
select
  'Joe Tom' as staff_name,
  coalesce(sum(case when p.paid_at >= pr.today_start and p.paid_at <= pr.today_end then p.amount else 0 end), 0.00) as "My collections today (AED)",
  count(case when p.paid_at >= pr.today_start and p.paid_at <= pr.today_end then 1 end) as "Today receipts count",
  coalesce(sum(case when p.paid_at >= pr.month_start and p.paid_at <= pr.today_end then p.amount else 0 end), 0.00) as "My collections this month (AED)",
  (select count(id) from public.enrollments e join params pr2 on true where e.admission_staff_id = pr2.joe_id and e.created_at >= pr2.month_start and e.created_at <= pr2.today_end) as "Month new admissions",
  (select count(distinct e.student_id) from public.enrollments e join params pr2 on true where e.admission_staff_id = pr2.joe_id and e.status = 'active') as "My candidates",
  count(p.id) as "My receipts"
from params pr
left join public.payments p on p.received_by = pr.joe_id and p.status = 'valid'
group by pr.joe_id, pr.today_start, pr.today_end, pr.month_start;
