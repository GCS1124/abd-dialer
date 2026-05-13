-- Store one RingCentral connection per workspace user.
-- The RingCentral edge function uses the service role to read and update this table.

create table if not exists public.ringcentral_integrations (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  account_id text,
  extension_id text,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz,
  selected_caller_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ringcentral_integrations enable row level security;
