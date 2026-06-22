begin;

alter table if exists public.ringcentral_workspace_configs
  add column if not exists jwt_credential text not null default '';

commit;
