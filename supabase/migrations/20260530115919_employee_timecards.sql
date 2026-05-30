begin;

create table if not exists public.employee_timecards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  work_date date not null,
  timezone text not null,
  time_on_system_seconds integer not null default 0,
  break_seconds integer not null default 0,
  wrap_seconds integer not null default 0,
  login_hours_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_timecards_user_work_date_idx
  on public.employee_timecards (user_id, work_date);

create index if not exists employee_timecards_work_date_idx
  on public.employee_timecards (work_date desc);

alter table public.employee_timecards enable row level security;

grant select, insert, update, delete on public.employee_timecards to authenticated;

drop policy if exists "Authenticated users can manage employee timecards" on public.employee_timecards;
create policy "Authenticated users can manage employee timecards"
on public.employee_timecards
for all
to authenticated
using (true)
with check (true);

with call_rows as (
  select
    cl.agent_id as user_id,
    au.timezone,
    (cl.created_at at time zone au.timezone)::date as work_date,
    cl.created_at,
    coalesce(cl.duration_seconds, 0) as time_on_system_seconds,
    coalesce(cl.wrap_up_duration_seconds, 0) as wrap_seconds,
    lead(cl.created_at) over (
      partition by cl.agent_id, (cl.created_at at time zone au.timezone)::date
      order by cl.created_at, cl.id
    ) as next_created_at
  from public.call_logs cl
  join public.app_users au on au.id = cl.agent_id
  where cl.agent_id is not null
),
daily as (
  select
    user_id,
    work_date,
    timezone,
    sum(time_on_system_seconds)::integer as time_on_system_seconds,
    sum(wrap_seconds)::integer as wrap_seconds,
    sum(
      greatest(
        0,
        coalesce(
          extract(
            epoch from (
              next_created_at
              - (created_at + make_interval(secs => time_on_system_seconds + wrap_seconds))
            )
          ),
          0
        )
      )
    )::integer as break_seconds
  from call_rows
  group by user_id, work_date, timezone
)
insert into public.employee_timecards (
  user_id,
  work_date,
  timezone,
  time_on_system_seconds,
  break_seconds,
  wrap_seconds,
  login_hours_seconds
)
select
  user_id,
  work_date,
  timezone,
  time_on_system_seconds,
  break_seconds,
  wrap_seconds,
  time_on_system_seconds + break_seconds + wrap_seconds as login_hours_seconds
from daily
on conflict (user_id, work_date) do update set
  timezone = excluded.timezone,
  time_on_system_seconds = excluded.time_on_system_seconds,
  break_seconds = excluded.break_seconds,
  wrap_seconds = excluded.wrap_seconds,
  login_hours_seconds = excluded.login_hours_seconds,
  updated_at = now();

commit;
