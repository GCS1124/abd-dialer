-- Restore the default GCS RingCentral workspace config.
-- Re-runnable upsert for the workspace-level credentials used by the connect flow.

begin;

insert into public.ringcentral_workspace_configs (
  workspace_id,
  server_url,
  jwt_credential,
  client_id,
  client_secret
)
values (
  '00000000-0000-0000-0000-000000000001',
  'https://platform.ringcentral.com',
  'eyJraWQiOiI4NzYyZjU5OGQwNTk0NGRiODZiZjVjYTk3ODA0NzYwOCIsInR5cCI6IkpXVCIsImFsZyI6IlJTMjU2In0.eyJhdWQiOiJodHRwczovL3BsYXRmb3JtLnJpbmdjZW50cmFsLmNvbS9yZXN0YXBpL29hdXRoL3Rva2VuIiwic3ViIjoiNjMzOTgyNjAwMDciLCJpc3MiOiJodHRwczovL3BsYXRmb3JtLnJpbmdjZW50cmFsLmNvbSIsImV4cCI6MzkyNjE1NTg4MCwiaWF0IjoxNzc4NjcyMjMzLCJqdGkiOiJKNjdaekM4alRrcXVfZlJKVUxQVEVBIn0.PHfRyU4AHNfBXvdw-zuFMH59jfJVP0QNv351AnmKZ4zcBXY2zbd9ECEDlhEtYgWGqfbtYCPykixDmMzmAm5oS-OmKKb3chYotsu2FyuYMwUFvVaShfz3Em-JQ1HWtEWNhOOz0F0oyk9zjJqamYa9tPo5H7EOzc9MdItZ9N5nQ5-VXVX9ezU96no_wLSUv116eM3cEHmm-4OdxprOXErIygNYh7iExhl5w-gB3x1n9TrZGh6kGRo_FtdB0OfsCXZHR5OaQ-W2moKVDENsUaIHZ_IT9PPaku1y_1FwahOs3YvZFnbPh-z8dSrpVt9X2J5orNbhcKGLerC6n_58--CAbg',
  '08IfXYmGtFtaZ8GxHPC1b8',
  'drvvQjSTfueaYAmrSF4xeReYftdNZWG2aduuHTpj0oPR'
)
on conflict (workspace_id) do update
  set server_url = excluded.server_url,
      jwt_credential = excluded.jwt_credential,
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      updated_at = now();

commit;
