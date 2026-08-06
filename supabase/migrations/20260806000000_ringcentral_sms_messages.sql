begin;

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

alter table public.ringcentral_sms_messages enable row level security;

grant select on public.ringcentral_sms_messages to authenticated;

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

commit;
