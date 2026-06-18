begin;

alter table if exists public.ringcentral_integrations
  add column if not exists selected_caller_id_source text not null default 'auto'
  check (selected_caller_id_source in ('auto', 'manual'));

update public.ringcentral_integrations
set selected_caller_id_source = coalesce(selected_caller_id_source, 'auto');

commit;
