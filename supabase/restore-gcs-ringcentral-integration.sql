-- Restore the default GCS RingCentral integration row.
-- This is a template for the per-user RingCentral token row.
-- The access/refresh token pair is produced by RingCentral after the JWT
-- exchange, so replace the placeholders below with the live GCS values before
-- running this file.

begin;

with target_user as (
  select id, workspace_id
  from public.app_users
  where workspace_id = '00000000-0000-0000-0000-000000000001'
    and role = 'admin'
  order by updated_at desc, created_at desc
  limit 1
)
insert into public.ringcentral_integrations (
  app_user_id,
  workspace_id,
  account_id,
  extension_id,
  access_token,
  refresh_token,
  token_type,
  scope,
  access_token_expires_at,
  refresh_token_expires_at,
  selected_caller_id,
  selected_caller_id_source,
  cached_ringout_numbers,
  subscription_id,
  subscription_expires_at,
  webhook_validation_token,
  last_inbound_event_at,
  active_telephony_session_id,
  active_telephony_party_id,
  active_telephony_direction,
  active_telephony_status_code,
  active_telephony_updated_at,
  connected_at,
  updated_at
)
select
  target_user.id,
  target_user.workspace_id,
  'REPLACE_WITH_GCS_ACCOUNT_ID',
  'REPLACE_WITH_GCS_EXTENSION_ID',
  'REPLACE_WITH_GCS_ACCESS_TOKEN',
  'REPLACE_WITH_GCS_REFRESH_TOKEN',
  'Bearer',
  'REPLACE_WITH_GCS_SCOPE',
  now(),
  null,
  'auto',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  now(),
  now()
from target_user
on conflict (app_user_id) do update
  set workspace_id = excluded.workspace_id,
      account_id = excluded.account_id,
      extension_id = excluded.extension_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_type = excluded.token_type,
      scope = excluded.scope,
      access_token_expires_at = excluded.access_token_expires_at,
      refresh_token_expires_at = excluded.refresh_token_expires_at,
      selected_caller_id = excluded.selected_caller_id,
      selected_caller_id_source = excluded.selected_caller_id_source,
      cached_ringout_numbers = excluded.cached_ringout_numbers,
      subscription_id = excluded.subscription_id,
      subscription_expires_at = excluded.subscription_expires_at,
      webhook_validation_token = excluded.webhook_validation_token,
      last_inbound_event_at = excluded.last_inbound_event_at,
      active_telephony_session_id = excluded.active_telephony_session_id,
      active_telephony_party_id = excluded.active_telephony_party_id,
      active_telephony_direction = excluded.active_telephony_direction,
      active_telephony_status_code = excluded.active_telephony_status_code,
      active_telephony_updated_at = excluded.active_telephony_updated_at,
      connected_at = excluded.connected_at,
      updated_at = excluded.updated_at;

commit;
