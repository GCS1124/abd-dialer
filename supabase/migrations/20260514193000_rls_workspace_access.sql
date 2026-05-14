begin;

-- The browser client uses the authenticated role.
grant usage on schema public to authenticated;

create index if not exists app_users_auth_user_id_idx
  on public.app_users (auth_user_id);

grant select, insert, update, delete on public.app_users to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.lead_tags to authenticated;
grant select, insert, update, delete on public.lead_notes to authenticated;
grant select, insert, update, delete on public.call_logs to authenticated;
grant select, insert, update, delete on public.callbacks to authenticated;
grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.queue_progress to authenticated;

alter table public.app_users enable row level security;
alter table public.leads enable row level security;
alter table public.lead_tags enable row level security;
alter table public.lead_notes enable row level security;
alter table public.call_logs enable row level security;
alter table public.callbacks enable row level security;
alter table public.activity_logs enable row level security;
alter table public.appointments enable row level security;
alter table public.queue_progress enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ringcentral_integrations enable row level security;

-- Keep the browser functional. The app already filters visibility in the UI.
drop policy if exists "Authenticated users can manage workspace users" on public.app_users;
create policy "Authenticated users can manage workspace users"
on public.app_users
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage leads" on public.leads;
create policy "Authenticated users can manage leads"
on public.leads
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage lead tags" on public.lead_tags;
create policy "Authenticated users can manage lead tags"
on public.lead_tags
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage lead notes" on public.lead_notes;
create policy "Authenticated users can manage lead notes"
on public.lead_notes
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage call logs" on public.call_logs;
create policy "Authenticated users can manage call logs"
on public.call_logs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage callbacks" on public.callbacks;
create policy "Authenticated users can manage callbacks"
on public.callbacks
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage activity logs" on public.activity_logs;
create policy "Authenticated users can manage activity logs"
on public.activity_logs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage appointments" on public.appointments;
create policy "Authenticated users can manage appointments"
on public.appointments
for all
to authenticated
using (true)
with check (true);

-- Queue progress stays per-user.
drop policy if exists "Users can view their queue progress" on public.queue_progress;
create policy "Users can view their queue progress"
on public.queue_progress
for select
to authenticated
using (
  exists (
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
  exists (
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
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
)
with check (
  exists (
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
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
);

-- These tables are service-role only. The edge functions already use the service role key,
-- so they bypass RLS and will continue to work.
revoke all on public.audit_logs from authenticated;
revoke all on public.ringcentral_integrations from authenticated;

commit;
