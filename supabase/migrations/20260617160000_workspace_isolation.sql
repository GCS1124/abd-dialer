begin;

create extension if not exists "pgcrypto";

create table if not exists public.workspaces (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspaces (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'default', 'GCS')
on conflict (slug) do nothing;

create schema if not exists private;

alter table if exists public.app_users
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.campaigns
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.lead_tags
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.lead_notes
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.call_logs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.callbacks
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.activity_logs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.appointments
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.audit_logs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.queue_progress
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.ringcentral_integrations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.employee_attendance_days
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table if exists public.employee_timecards
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create or replace function private.default_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select '00000000-0000-0000-0000-000000000001'::uuid;
$$;

create or replace function private.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select au.workspace_id
  from public.app_users au
  where au.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function private.request_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(private.current_workspace_id(), private.default_workspace_id());
$$;

create or replace function private.workspace_for_app_user(target_app_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (
      select au.workspace_id
      from public.app_users au
      where au.id = target_app_user_id
      limit 1
    ),
    private.request_workspace_id()
  );
$$;

create or replace function private.workspace_for_lead(target_lead_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (
      select l.workspace_id
      from public.leads l
      where l.id = target_lead_id
      limit 1
    ),
    private.request_workspace_id()
  );
$$;

create or replace function private.is_current_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select target_workspace_id is not null
    and target_workspace_id = private.current_workspace_id();
$$;

create or replace function private.assign_workspace_on_app_users()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.request_workspace_id();
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_leads()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.assigned_agent);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_campaigns()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.assigned_user_id);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_lead_related()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_lead(new.lead_id);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_audit_logs()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.actor_id);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_queue_progress()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.user_id);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_ringcentral_integrations()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.app_user_id);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_employee_timecards()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.user_id);
  end if;

  return new;
end;
$$;

create or replace function private.assign_workspace_on_employee_attendance_days()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := private.workspace_for_app_user(new.employee_id);
  end if;

  return new;
end;
$$;

update public.app_users
set workspace_id = coalesce(workspace_id, private.default_workspace_id());

update public.leads
set workspace_id = coalesce(
  workspace_id,
  private.workspace_for_app_user(assigned_agent),
  private.default_workspace_id()
)
where workspace_id is null;

update public.campaigns
set workspace_id = coalesce(
  workspace_id,
  private.workspace_for_app_user(assigned_user_id),
  private.default_workspace_id()
)
where workspace_id is null;

update public.lead_tags lt
set workspace_id = coalesce(lt.workspace_id, l.workspace_id, private.default_workspace_id())
from public.leads l
where lt.lead_id = l.id
  and lt.workspace_id is null;

update public.lead_notes ln
set workspace_id = coalesce(ln.workspace_id, l.workspace_id, private.default_workspace_id())
from public.leads l
where ln.lead_id = l.id
  and ln.workspace_id is null;

update public.call_logs cl
set workspace_id = coalesce(cl.workspace_id, l.workspace_id, private.default_workspace_id())
from public.leads l
where cl.lead_id = l.id
  and cl.workspace_id is null;

update public.callbacks cb
set workspace_id = coalesce(cb.workspace_id, l.workspace_id, private.default_workspace_id())
from public.leads l
where cb.lead_id = l.id
  and cb.workspace_id is null;

update public.activity_logs al
set workspace_id = coalesce(al.workspace_id, l.workspace_id, private.default_workspace_id())
from public.leads l
where al.lead_id = l.id
  and al.workspace_id is null;

update public.appointments ap
set workspace_id = coalesce(ap.workspace_id, l.workspace_id, private.default_workspace_id())
from public.leads l
where ap.lead_id = l.id
  and ap.workspace_id is null;

update public.audit_logs al
set workspace_id = coalesce(al.workspace_id, private.workspace_for_app_user(al.actor_id), private.default_workspace_id())
where al.workspace_id is null;

update public.queue_progress qp
set workspace_id = coalesce(qp.workspace_id, private.workspace_for_app_user(qp.user_id), private.default_workspace_id())
where qp.workspace_id is null;

update public.ringcentral_integrations rci
set workspace_id = coalesce(rci.workspace_id, private.workspace_for_app_user(rci.app_user_id), private.default_workspace_id())
where rci.workspace_id is null;

update public.employee_attendance_days ead
set workspace_id = coalesce(ead.workspace_id, private.workspace_for_app_user(ead.employee_id), private.default_workspace_id())
where ead.workspace_id is null;

update public.employee_timecards et
set workspace_id = coalesce(et.workspace_id, private.workspace_for_app_user(et.user_id), private.default_workspace_id())
where et.workspace_id is null;

alter table if exists public.app_users alter column workspace_id set not null;
alter table if exists public.leads alter column workspace_id set not null;
alter table if exists public.campaigns alter column workspace_id set not null;
alter table if exists public.lead_tags alter column workspace_id set not null;
alter table if exists public.lead_notes alter column workspace_id set not null;
alter table if exists public.call_logs alter column workspace_id set not null;
alter table if exists public.callbacks alter column workspace_id set not null;
alter table if exists public.activity_logs alter column workspace_id set not null;
alter table if exists public.appointments alter column workspace_id set not null;
alter table if exists public.audit_logs alter column workspace_id set not null;
alter table if exists public.queue_progress alter column workspace_id set not null;
alter table if exists public.ringcentral_integrations alter column workspace_id set not null;
alter table if exists public.employee_attendance_days alter column workspace_id set not null;
alter table if exists public.employee_timecards alter column workspace_id set not null;

create index if not exists app_users_auth_user_id_idx
  on public.app_users (auth_user_id);

create index if not exists app_users_workspace_idx
  on public.app_users (workspace_id);

create index if not exists leads_workspace_idx
  on public.leads (workspace_id);

create index if not exists lead_tags_workspace_idx
  on public.lead_tags (workspace_id);

create index if not exists lead_notes_workspace_idx
  on public.lead_notes (workspace_id);

create index if not exists call_logs_workspace_idx
  on public.call_logs (workspace_id);

create index if not exists callbacks_workspace_idx
  on public.callbacks (workspace_id);

create index if not exists activity_logs_workspace_idx
  on public.activity_logs (workspace_id);

create index if not exists appointments_workspace_idx
  on public.appointments (workspace_id);

create index if not exists audit_logs_workspace_idx
  on public.audit_logs (workspace_id);

create index if not exists queue_progress_workspace_idx
  on public.queue_progress (workspace_id);

create index if not exists ringcentral_integrations_workspace_idx
  on public.ringcentral_integrations (workspace_id);

create index if not exists employee_attendance_days_workspace_idx
  on public.employee_attendance_days (workspace_id);

create index if not exists employee_timecards_workspace_idx
  on public.employee_timecards (workspace_id);

create unique index if not exists employee_timecards_user_work_date_idx
  on public.employee_timecards (user_id, work_date);

create index if not exists employee_timecards_work_date_idx
  on public.employee_timecards (work_date desc);

create index if not exists campaigns_workspace_source_key_idx
  on public.campaigns (workspace_id, source_key);

create index if not exists campaigns_assigned_user_idx
  on public.campaigns (assigned_user_id);

create index if not exists campaigns_is_active_idx
  on public.campaigns (is_active);

create index if not exists ringcentral_integrations_subscription_id_idx
  on public.ringcentral_integrations (subscription_id);

create index if not exists callbacks_owner_idx
  on public.callbacks (owner_id, scheduled_for);

create index if not exists call_logs_agent_id_idx
  on public.call_logs (agent_id, created_at desc);

create index if not exists call_logs_ringcentral_session_idx
  on public.call_logs (ringcentral_session_id);

create index if not exists leads_assigned_agent_idx
  on public.leads (assigned_agent);

create index if not exists leads_status_idx
  on public.leads (status);

create index if not exists leads_callback_time_idx
  on public.leads (callback_time);

create index if not exists leads_next_eligible_at_idx
  on public.leads (next_eligible_at);

create index if not exists leads_next_callback_at_idx
  on public.leads (next_callback_at);

create index if not exists leads_next_follow_up_at_idx
  on public.leads (next_follow_up_at);

create index if not exists leads_is_dnc_idx
  on public.leads (is_dnc);

create index if not exists leads_is_invalid_number_idx
  on public.leads (is_invalid_number);

create index if not exists leads_contact_attempt_count_idx
  on public.leads (contact_attempt_count);

alter table if exists public.app_users enable row level security;
alter table if exists public.leads enable row level security;
alter table if exists public.campaigns enable row level security;
alter table if exists public.lead_tags enable row level security;
alter table if exists public.lead_notes enable row level security;
alter table if exists public.call_logs enable row level security;
alter table if exists public.callbacks enable row level security;
alter table if exists public.activity_logs enable row level security;
alter table if exists public.appointments enable row level security;
alter table if exists public.audit_logs enable row level security;
alter table if exists public.queue_progress enable row level security;
alter table if exists public.ringcentral_integrations enable row level security;
alter table if exists public.employee_attendance_days enable row level security;
alter table if exists public.employee_timecards enable row level security;

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.app_users to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.lead_tags to authenticated;
grant select, insert, update, delete on public.lead_notes to authenticated;
grant select, insert, update, delete on public.call_logs to authenticated;
grant select, insert, update, delete on public.callbacks to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.queue_progress to authenticated;
grant select, insert, update, delete on public.employee_attendance_days to authenticated;
grant select, insert, update, delete on public.employee_timecards to authenticated;

drop policy if exists "Authenticated users can manage workspace users" on public.app_users;
create policy "Authenticated users can manage workspace users"
on public.app_users
for all
to authenticated
using (
  auth_user_id = auth.uid()
    or private.is_current_workspace(workspace_id)
)
with check (
  auth_user_id = auth.uid()
    or private.is_current_workspace(workspace_id)
);

drop policy if exists "Authenticated users can manage leads" on public.leads;
create policy "Authenticated users can manage leads"
on public.leads
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage campaigns" on public.campaigns;
create policy "Authenticated users can manage campaigns"
on public.campaigns
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage lead tags" on public.lead_tags;
create policy "Authenticated users can manage lead tags"
on public.lead_tags
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage lead notes" on public.lead_notes;
create policy "Authenticated users can manage lead notes"
on public.lead_notes
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage call logs" on public.call_logs;
create policy "Authenticated users can manage call logs"
on public.call_logs
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage callbacks" on public.callbacks;
create policy "Authenticated users can manage callbacks"
on public.callbacks
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage activity logs" on public.activity_logs;
create policy "Authenticated users can manage activity logs"
on public.activity_logs
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage appointments" on public.appointments;
create policy "Authenticated users can manage appointments"
on public.appointments
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Users can view their queue progress" on public.queue_progress;
create policy "Users can view their queue progress"
on public.queue_progress
for select
to authenticated
using (
  private.is_current_workspace(workspace_id)
    and exists (
      select 1
      from public.app_users au
      where au.auth_user_id = auth.uid()
        and au.id = user_id
    )
);

drop policy if exists "Users can insert their queue progress" on public.queue_progress;
create policy "Users can insert their queue progress"
on public.queue_progress
for insert
to authenticated
with check (
  private.is_current_workspace(workspace_id)
    and exists (
      select 1
      from public.app_users au
      where au.auth_user_id = auth.uid()
        and au.id = user_id
    )
);

drop policy if exists "Users can update their queue progress" on public.queue_progress;
create policy "Users can update their queue progress"
on public.queue_progress
for update
to authenticated
using (
  private.is_current_workspace(workspace_id)
    and exists (
      select 1
      from public.app_users au
      where au.auth_user_id = auth.uid()
        and au.id = user_id
    )
)
with check (
  private.is_current_workspace(workspace_id)
    and exists (
      select 1
      from public.app_users au
      where au.auth_user_id = auth.uid()
        and au.id = user_id
    )
);

drop policy if exists "Users can delete their queue progress" on public.queue_progress;
create policy "Users can delete their queue progress"
on public.queue_progress
for delete
to authenticated
using (
  private.is_current_workspace(workspace_id)
    and exists (
      select 1
      from public.app_users au
      where au.auth_user_id = auth.uid()
        and au.id = user_id
    )
);

drop policy if exists "Authenticated users can manage employee attendance days" on public.employee_attendance_days;
create policy "Authenticated users can manage employee attendance days"
on public.employee_attendance_days
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

drop policy if exists "Authenticated users can manage employee timecards" on public.employee_timecards;
create policy "Authenticated users can manage employee timecards"
on public.employee_timecards
for all
to authenticated
using (private.is_current_workspace(workspace_id))
with check (private.is_current_workspace(workspace_id));

revoke all on public.audit_logs from authenticated;
revoke all on public.ringcentral_integrations from authenticated;

drop trigger if exists set_workspace_id_on_app_users on public.app_users;
create trigger set_workspace_id_on_app_users
before insert on public.app_users
for each row
execute function private.assign_workspace_on_app_users();

drop trigger if exists set_workspace_id_on_leads on public.leads;
create trigger set_workspace_id_on_leads
before insert on public.leads
for each row
execute function private.assign_workspace_on_leads();

drop trigger if exists set_workspace_id_on_campaigns on public.campaigns;
create trigger set_workspace_id_on_campaigns
before insert on public.campaigns
for each row
execute function private.assign_workspace_on_campaigns();

drop trigger if exists set_workspace_id_on_lead_tags on public.lead_tags;
create trigger set_workspace_id_on_lead_tags
before insert on public.lead_tags
for each row
execute function private.assign_workspace_on_lead_related();

drop trigger if exists set_workspace_id_on_lead_notes on public.lead_notes;
create trigger set_workspace_id_on_lead_notes
before insert on public.lead_notes
for each row
execute function private.assign_workspace_on_lead_related();

drop trigger if exists set_workspace_id_on_call_logs on public.call_logs;
create trigger set_workspace_id_on_call_logs
before insert on public.call_logs
for each row
execute function private.assign_workspace_on_lead_related();

drop trigger if exists set_workspace_id_on_callbacks on public.callbacks;
create trigger set_workspace_id_on_callbacks
before insert on public.callbacks
for each row
execute function private.assign_workspace_on_lead_related();

drop trigger if exists set_workspace_id_on_activity_logs on public.activity_logs;
create trigger set_workspace_id_on_activity_logs
before insert on public.activity_logs
for each row
execute function private.assign_workspace_on_lead_related();

drop trigger if exists set_workspace_id_on_appointments on public.appointments;
create trigger set_workspace_id_on_appointments
before insert on public.appointments
for each row
execute function private.assign_workspace_on_lead_related();

drop trigger if exists set_workspace_id_on_audit_logs on public.audit_logs;
create trigger set_workspace_id_on_audit_logs
before insert on public.audit_logs
for each row
execute function private.assign_workspace_on_audit_logs();

drop trigger if exists set_workspace_id_on_queue_progress on public.queue_progress;
create trigger set_workspace_id_on_queue_progress
before insert on public.queue_progress
for each row
execute function private.assign_workspace_on_queue_progress();

drop trigger if exists set_workspace_id_on_ringcentral_integrations on public.ringcentral_integrations;
create trigger set_workspace_id_on_ringcentral_integrations
before insert on public.ringcentral_integrations
for each row
execute function private.assign_workspace_on_ringcentral_integrations();

drop trigger if exists set_workspace_id_on_employee_attendance_days on public.employee_attendance_days;
create trigger set_workspace_id_on_employee_attendance_days
before insert on public.employee_attendance_days
for each row
execute function private.assign_workspace_on_employee_attendance_days();

drop trigger if exists set_workspace_id_on_employee_timecards on public.employee_timecards;
create trigger set_workspace_id_on_employee_timecards
before insert on public.employee_timecards
for each row
execute function private.assign_workspace_on_employee_timecards();

commit;
