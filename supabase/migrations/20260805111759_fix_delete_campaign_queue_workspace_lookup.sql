create or replace function public.delete_campaign_queue(
  target_campaign_id uuid,
  target_source_key text
)
returns table (
  deleted_campaigns integer,
  deleted_leads integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  workspace_id_to_delete uuid;
  source_key_to_delete text;
  deleted_campaign_count integer := 0;
  deleted_lead_count integer := 0;
begin
  select au.workspace_id
  into workspace_id_to_delete
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.role in ('admin', 'team_leader')
  limit 1;

  if workspace_id_to_delete is null then
    raise exception using
      errcode = '42501',
      message = 'Campaign management is restricted to admins and team leaders.';
  end if;

  if target_campaign_id is not null then
    select lower(coalesce(nullif(btrim(c.source_key), ''), 'uncategorized'))
    into source_key_to_delete
    from public.campaigns c
    where c.id = target_campaign_id
      and c.workspace_id = workspace_id_to_delete;

    if source_key_to_delete is null then
      raise exception using
        errcode = 'P0002',
        message = 'Campaign not found.';
    end if;
  else
    if target_source_key is null then
      raise exception using
        errcode = '22023',
        message = 'Campaign source key is required.';
    end if;

    source_key_to_delete := lower(coalesce(nullif(btrim(target_source_key), ''), 'uncategorized'));
  end if;

  delete from public.leads l
  where l.workspace_id = workspace_id_to_delete
    and lower(coalesce(nullif(btrim(l.source), ''), 'uncategorized')) = source_key_to_delete;
  get diagnostics deleted_lead_count = row_count;

  delete from public.campaigns c
  where c.workspace_id = workspace_id_to_delete
    and (
      (target_campaign_id is not null and c.id = target_campaign_id)
      or (
        target_campaign_id is null
        and lower(coalesce(nullif(btrim(c.source_key), ''), 'uncategorized')) = source_key_to_delete
      )
    );
  get diagnostics deleted_campaign_count = row_count;

  return query
  select deleted_campaign_count, deleted_lead_count;
end;
$$;
