-- Track the RingCentral webhook subscription so the edge function can renew it
-- and map incoming telephony session notifications back to the right workspace.

alter table public.ringcentral_integrations
  add column if not exists subscription_id text,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists webhook_validation_token text,
  add column if not exists last_inbound_event_at timestamptz;

create index if not exists ringcentral_integrations_subscription_id_idx
  on public.ringcentral_integrations (subscription_id);
