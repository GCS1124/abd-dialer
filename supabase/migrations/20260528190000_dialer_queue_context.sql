alter table public.leads
  add column if not exists last_disposition text,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists contact_attempt_count integer not null default 0,
  add column if not exists connected_attempt_count integer not null default 0,
  add column if not exists next_eligible_at timestamptz,
  add column if not exists next_callback_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists callback_priority text not null default 'Medium' check (callback_priority in ('Low', 'Medium', 'High', 'Urgent')),
  add column if not exists not_interested_reason text,
  add column if not exists is_dnc boolean not null default false,
  add column if not exists is_invalid_number boolean not null default false;

alter table public.call_logs
  add column if not exists wrap_up_started_at timestamptz,
  add column if not exists wrap_up_ended_at timestamptz,
  add column if not exists wrap_up_duration_seconds integer not null default 0,
  add column if not exists callback_at timestamptz,
  add column if not exists callback_priority text not null default 'Medium' check (callback_priority in ('Low', 'Medium', 'High', 'Urgent')),
  add column if not exists follow_up_at timestamptz,
  add column if not exists not_interested_reason text;

with call_stats as (
  select
    cl.lead_id,
    count(*)::integer as contact_attempt_count,
    count(*) filter (
      where cl.disposition not in (
        'No Answer',
        'Busy',
        'Voicemail',
        'Call Failed',
        'Switched Off',
        'Not Reachable',
        'Disconnected',
        'Network Issue',
        'Failed Attempt',
        'Rpc hung',
        'Not available',
        '3rd party hung up'
      )
    )::integer as connected_attempt_count,
    max(cl.created_at) as last_attempted_at,
    max(cl.created_at) filter (
      where cl.disposition not in (
        'No Answer',
        'Busy',
        'Voicemail',
        'Call Failed',
        'Switched Off',
        'Not Reachable',
        'Disconnected',
        'Network Issue',
        'Failed Attempt',
        'Rpc hung',
        'Not available',
        '3rd party hung up'
      )
    ) as last_contacted_at,
    (array_agg(cl.disposition order by cl.created_at desc))[1] as last_disposition
  from public.call_logs cl
  group by cl.lead_id
)
update public.leads l
set
  contact_attempt_count = greatest(coalesce(l.contact_attempt_count, 0), call_stats.contact_attempt_count),
  connected_attempt_count = greatest(coalesce(l.connected_attempt_count, 0), call_stats.connected_attempt_count),
  last_attempted_at = coalesce(l.last_attempted_at, call_stats.last_attempted_at),
  last_contacted_at = coalesce(l.last_contacted_at, call_stats.last_contacted_at, l.last_contacted),
  last_disposition = coalesce(l.last_disposition, call_stats.last_disposition),
  next_callback_at = coalesce(l.next_callback_at, l.callback_time),
  next_eligible_at = coalesce(l.next_eligible_at, l.callback_time)
from call_stats
where l.id = call_stats.lead_id;

update public.leads
set
  callback_priority = coalesce(callback_priority, priority),
  is_invalid_number = coalesce(is_invalid_number, false),
  is_dnc = coalesce(is_dnc, false);

create index if not exists leads_next_eligible_at_idx on public.leads (next_eligible_at);
create index if not exists leads_next_callback_at_idx on public.leads (next_callback_at);
create index if not exists leads_next_follow_up_at_idx on public.leads (next_follow_up_at);
create index if not exists leads_is_dnc_idx on public.leads (is_dnc);
create index if not exists leads_is_invalid_number_idx on public.leads (is_invalid_number);
create index if not exists leads_contact_attempt_count_idx on public.leads (contact_attempt_count);
