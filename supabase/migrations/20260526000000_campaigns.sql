begin;

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

create index if not exists campaigns_assigned_user_idx
  on public.campaigns (assigned_user_id);

create index if not exists campaigns_is_active_idx
  on public.campaigns (is_active);

insert into public.campaigns (name, source_key)
select distinct
  coalesce(nullif(trim(source), ''), 'Uncategorized') as name,
  lower(coalesce(nullif(trim(source), ''), 'uncategorized')) as source_key
from public.leads
on conflict (source_key) do update
set
  name = excluded.name,
  updated_at = now();

grant select, insert, update, delete on public.campaigns to authenticated;

alter table public.campaigns enable row level security;

drop policy if exists "Authenticated users can manage campaigns" on public.campaigns;
create policy "Authenticated users can manage campaigns"
on public.campaigns
for all
to authenticated
using (true)
with check (true);

commit;
