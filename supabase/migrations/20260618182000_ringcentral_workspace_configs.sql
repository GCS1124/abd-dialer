begin;

create table if not exists public.ringcentral_workspace_configs (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  server_url text not null default 'https://platform.ringcentral.com',
  client_id text not null,
  client_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ringcentral_workspace_configs enable row level security;

revoke all on public.ringcentral_workspace_configs from anon;
revoke all on public.ringcentral_workspace_configs from authenticated;

insert into public.ringcentral_workspace_configs (
  workspace_id,
  server_url,
  client_id,
  client_secret
)
values (
  '00000000-0000-0000-0000-000000000001',
  'https://platform.ringcentral.com',
  '2vsNbVvPIAidV3KR40nzOc',
  'ZqFAclHnFlddonDSed78MzdSCp46fNXRKfxhl9ACq7TS'
)
on conflict (workspace_id) do update
  set server_url = excluded.server_url,
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      updated_at = now();

commit;
