-- Restore the default GCS RingCentral workspace config.
-- Re-runnable upsert for the workspace-level credentials used by the connect flow.

begin;

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
