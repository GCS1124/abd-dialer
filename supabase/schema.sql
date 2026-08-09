create extension if not exists "pgcrypto";

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'team_leader', 'agent')),
  team_name text not null,
  title text,
  timezone text not null default 'UTC',
  status text not null default 'offline' check (status in ('online', 'away', 'offline')),
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  full_name text not null,
  phone text not null,
  alt_phone text,
  email text,
  company text,
  website text,
  job_title text,
  location text,
  source text,
  interest text,
  status text not null default 'new',
  notes text,
  last_contacted timestamptz,
  timezone text,
  last_disposition text,
  last_disposition_main text,
  last_disposition_sub text,
  last_attempted_at timestamptz,
  last_contacted_at timestamptz,
  contact_attempt_count integer not null default 0,
  connected_attempt_count integer not null default 0,
  next_eligible_at timestamptz,
  next_callback_at timestamptz,
  next_follow_up_at timestamptz,
  callback_priority text not null default 'Medium' check (callback_priority in ('Low', 'Medium', 'High', 'Urgent')),
  not_interested_reason text,
  is_dnc boolean not null default false,
  is_invalid_number boolean not null default false,
  assigned_agent uuid references public.app_users(id) on delete set null,
  callback_time timestamptz,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  lead_score integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_key text not null unique,
  assigned_user_id uuid references public.app_users(id) on delete set null,
  is_active boolean not null default true,
  allow_auto_dial boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references public.app_users(id) on delete set null,
  note_body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid references public.app_users(id) on delete set null,
  direction text not null default 'outgoing' check (direction in ('incoming', 'outgoing')),
  disposition text not null,
  duration_seconds integer not null default 0,
  call_status text not null default 'connected' check (call_status in ('connected', 'missed', 'follow_up')),
  recording_enabled boolean not null default false,
  recording_provider text,
  recording_url text,
  ringcentral_session_id text,
  ringcentral_recording_id text,
  recording_last_checked_at timestamptz,
  outcome_summary text,
  notes text,
  main_disposition text,
  sub_disposition text,
  wrap_up_started_at timestamptz,
  wrap_up_ended_at timestamptz,
  wrap_up_duration_seconds integer not null default 0,
  callback_at timestamptz,
  callback_priority text not null default 'Medium' check (callback_priority in ('Low', 'Medium', 'High', 'Urgent')),
  follow_up_at timestamptz,
  not_interested_reason text,
  created_at timestamptz not null default now()
);

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

create table if not exists public.callbacks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid references public.app_users(id) on delete set null,
  scheduled_for timestamptz not null,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'overdue', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.app_users(id) on delete set null,
  activity_type text not null,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid references public.app_users(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ringcentral_integrations (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  account_id text,
  extension_id text,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz,
  selected_caller_id text,
  selected_caller_id_source text not null default 'auto' check (selected_caller_id_source in ('auto', 'manual')),
  sms_sender_extension_id text,
  sms_sender_phone_number text,
  cached_ringout_numbers text,
  subscription_id text,
  subscription_expires_at timestamptz,
  webhook_validation_token text,
  last_inbound_event_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ringcentral_sms_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  selected_caller_id_number text not null,
  conversation_id text,
  message_id text not null,
  direction text not null check (direction in ('Inbound', 'Outbound')),
  from_phone_number text,
  from_name text,
  to_phone_numbers text[] not null default '{}'::text[],
  to_names text[] not null default '{}'::text[],
  subject text,
  text text not null,
  read_status text,
  message_status text,
  availability text,
  creation_time timestamptz,
  last_modified_time timestamptz,
  peer_phone_number text,
  peer_name text,
  source text not null default 'ringcentral',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ringcentral_workspace_configs (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  server_url text not null default 'https://platform.ringcentral.com',
  redirect_uri text not null default '',
  jwt_credential text not null default '',
  client_id text not null,
  client_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ringcentral_integrations enable row level security;
alter table public.ringcentral_sms_messages enable row level security;
alter table public.ringcentral_workspace_configs enable row level security;
alter table public.campaigns enable row level security;
alter table public.employee_timecards enable row level security;

grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.employee_timecards to authenticated;
grant select on public.ringcentral_sms_messages to authenticated;
revoke all on public.ringcentral_workspace_configs from anon;
revoke all on public.ringcentral_workspace_configs from authenticated;

drop policy if exists "Authenticated users can manage campaigns" on public.campaigns;
create policy "Authenticated users can manage campaigns"
on public.campaigns
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage employee timecards" on public.employee_timecards;
create policy "Authenticated users can manage employee timecards"
on public.employee_timecards
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Users can view their RingCentral SMS messages" on public.ringcentral_sms_messages;
create policy "Users can view their RingCentral SMS messages"
on public.ringcentral_sms_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = app_user_id
  )
);

create or replace function private.assign_workspace_on_ringcentral_sms_messages()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.app_user_id);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_workspace_id_on_ringcentral_sms_messages on public.ringcentral_sms_messages;
create trigger set_workspace_id_on_ringcentral_sms_messages
before insert or update on public.ringcentral_sms_messages
for each row
execute function private.assign_workspace_on_ringcentral_sms_messages();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    execute 'alter publication supabase_realtime add table public.ringcentral_sms_messages';
  end if;
end;
$$;

create index if not exists leads_assigned_agent_idx on public.leads (assigned_agent);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_callback_time_idx on public.leads (callback_time);
create index if not exists leads_next_eligible_at_idx on public.leads (next_eligible_at);
create index if not exists leads_next_callback_at_idx on public.leads (next_callback_at);
create index if not exists leads_next_follow_up_at_idx on public.leads (next_follow_up_at);
create index if not exists leads_is_dnc_idx on public.leads (is_dnc);
create index if not exists leads_is_invalid_number_idx on public.leads (is_invalid_number);
create index if not exists leads_contact_attempt_count_idx on public.leads (contact_attempt_count);
create index if not exists campaigns_assigned_user_idx on public.campaigns (assigned_user_id);
create index if not exists campaigns_is_active_idx on public.campaigns (is_active);
create index if not exists call_logs_agent_id_idx on public.call_logs (agent_id, created_at desc);
create index if not exists call_logs_recording_provider_idx on public.call_logs (recording_provider);
create index if not exists call_logs_ringcentral_session_idx on public.call_logs (ringcentral_session_id);
create unique index if not exists employee_timecards_user_work_date_idx on public.employee_timecards (user_id, work_date);
create index if not exists employee_timecards_work_date_idx on public.employee_timecards (work_date desc);
create index if not exists callbacks_owner_idx on public.callbacks (owner_id, scheduled_for);
create unique index if not exists ringcentral_sms_messages_app_user_message_id_idx
  on public.ringcentral_sms_messages (app_user_id, message_id);
create index if not exists ringcentral_sms_messages_app_user_selected_time_idx
  on public.ringcentral_sms_messages (app_user_id, selected_caller_id_number, creation_time desc);
create index if not exists ringcentral_sms_messages_app_user_conversation_idx
  on public.ringcentral_sms_messages (app_user_id, conversation_id);
create index if not exists ringcentral_sms_messages_app_user_peer_idx
  on public.ringcentral_sms_messages (app_user_id, peer_phone_number);
create index if not exists ringcentral_sms_messages_lead_idx
  on public.ringcentral_sms_messages (lead_id);

create or replace view public.agent_daily_metrics as
select
  au.id as agent_id,
  au.full_name as agent_name,
  date_trunc('day', cl.created_at) as activity_day,
  count(cl.id) as total_calls,
  count(*) filter (where cl.disposition in ('Interested', 'Appointment Booked', 'Sale Closed')) as connected_calls,
  count(*) filter (where cl.disposition = 'Appointment Booked') as appointments_booked,
  count(*) filter (where cl.disposition = 'Sale Closed') as sales_closed,
  round(avg(cl.duration_seconds)::numeric, 2) as avg_call_duration
from public.app_users au
left join public.call_logs cl on cl.agent_id = au.id
where au.role = 'agent'
group by au.id, au.full_name, date_trunc('day', cl.created_at);
