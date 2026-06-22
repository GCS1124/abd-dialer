begin;

alter table if exists public.ringcentral_workspace_configs
  add column if not exists redirect_uri text not null default '';

commit;
