-- Bootstrap SQL for a new paid RingCentral tenant.
-- Update the admin name and email if you want to use different values.

begin;

create extension if not exists "pgcrypto";

with workspace as (
  insert into public.workspaces (id, slug, name)
  values (
    gen_random_uuid(),
    'abd',
    'ABD'
  )
  on conflict (slug) do update
    set name = excluded.name,
        updated_at = now()
  returning id
),
app_user as (
  insert into public.app_users (
    id,
    workspace_id,
    auth_user_id,
    full_name,
    email,
    role,
    team_name,
    title,
    timezone,
    status,
    must_reset_password
  )
  select
    gen_random_uuid(),
    workspace.id,
    null,
    'Admin Name',
    'admin@example.com',
    'admin',
    'Default Team',
    'Workspace Admin',
    'UTC',
    'offline',
    false
  from workspace
  on conflict (email) do update
    set workspace_id = excluded.workspace_id,
        auth_user_id = excluded.auth_user_id,
        full_name = excluded.full_name,
        role = excluded.role,
        team_name = excluded.team_name,
        title = excluded.title,
        timezone = excluded.timezone,
        status = excluded.status,
        must_reset_password = excluded.must_reset_password,
        updated_at = now()
  returning id, workspace_id
),
ringcentral_workspace_config as (
  insert into public.ringcentral_workspace_configs (
    workspace_id,
    server_url,
    redirect_uri,
    jwt_credential,
    client_id,
    client_secret
  )
  select
    app_user.workspace_id,
    'https://platform.ringcentral.com',
    'https://abd-dialer-client.vercel.app/settings',
    '',
    '2vsNbVvPIAidV3KR40nzOc',
    'ZqFAclHnFlddonDSed78MzdSCp46fNXRKfxhl9ACq7TS'
  from app_user
  on conflict (workspace_id) do update
    set server_url = excluded.server_url,
        redirect_uri = excluded.redirect_uri,
        jwt_credential = excluded.jwt_credential,
        client_id = excluded.client_id,
        client_secret = excluded.client_secret,
        updated_at = now()
  returning workspace_id
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
  app_user.id,
  app_user.workspace_id,
  '3313060011',
  '3313060011',
  'SUFENDFQMDRQQVMwMHxBQUJnak5NUlQ4X1pwOWF5dl9JenpfVmlHMFNOVGlpbHlLNUZ1NHZYNGxWMjN4UVZCa2VmNmhxVTFjdHBTckEySlM2MTdZSkhaLW1qZkt6VkhwRDBLLWZld3o0TDdzMDN6cXRsU3JIanY3LUlReGVpenV5WXRzbVprcHhiMWlxdmIxVVBJNG5jeUUyaklTcUlxVTN4MlhRQS1GTnVCTUNNVFNpOUxaQ0Y1cmJURzNXR21KdEN5UWxkOExBVjNHd0FMQkdJVkd3Yng2VnZvYmxMYjFBck1RYzNzZEdDU1F8OVRNcUtBfHZISkhwOHpYSFRKYTd0NDc4N2xRUHd8QVF8QUF8QUFBQUFMOC16NGM',
  'SUFENDFQMDRQQVMwMHxBQUFoUzNEVjZhN3FXQ2xXSE5zMkhtaUllNWJ4c3QxcFl6bXZxSWtwU1dfTmg2VHNEaG5PdjA1aVRXcmhWUmhhOEFGelVOU0pjSDRIZmpSQmVKLVhSekdFVjFsNGVfNTNNQ3RtWmw0R1N0N3ZQaHZjc0J5T1RaeDAwRHVNcUlOY0MxLVJtMTlfbk9DbXZ1ZzA3dWRNaDRYdG5GNk9kbmF3X3FyUUFGSFpNM1puaVJwNnR6eldKdGVFVGpnSU40Q1h0akNXc2xZY3liUi0xOWVXTGVSSHpQQUFRVy1KN3d8OVRNcUtBfEw4YTRkMlVoVlJ5WjVLWlFSTDZYbGd8QVF8QUF8QUFBQUFNdGZNa0k',
  'Bearer',
  'CallControl RingSense VoipCalling ReadContacts ReadAccounts TeamMessaging SubscriptionWebhook EditPresence ReadMessages Faxes ReadPresence ReadCallRecording A2PSMS Analytics WebSocket SubscriptionWebSocket Contacts EditExtensions RoleManagement Video RingOut ReadAuditTrail SMS InternalMessages ReadCallLog EditMessages',
  '2026-06-17T18:25:30.637563Z'::timestamptz,
  '2026-06-24T17:25:30.637563Z'::timestamptz,
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
from app_user
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
