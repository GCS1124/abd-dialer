alter table public.call_logs
  add column if not exists recording_provider text,
  add column if not exists ringcentral_session_id text,
  add column if not exists ringcentral_recording_id text,
  add column if not exists recording_last_checked_at timestamptz;

update public.call_logs
set
  ringcentral_session_id = substring(notes from 'RingCentral session ([A-Za-z0-9._:-]+)'),
  recording_provider = coalesce(recording_provider, 'ringcentral')
where
  ringcentral_session_id is null
  and notes is not null
  and notes ~ 'RingCentral session [A-Za-z0-9._:-]+';

create index if not exists call_logs_recording_provider_idx
  on public.call_logs (recording_provider);

create index if not exists call_logs_ringcentral_session_idx
  on public.call_logs (ringcentral_session_id);
