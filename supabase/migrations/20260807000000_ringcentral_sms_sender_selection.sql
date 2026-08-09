alter table if exists public.ringcentral_integrations
  add column if not exists sms_sender_extension_id text,
  add column if not exists sms_sender_phone_number text;

comment on column public.ringcentral_integrations.sms_sender_extension_id is
  'RingCentral extension authorized to send and receive SMS; independent from the voice caller ID.';

comment on column public.ringcentral_integrations.sms_sender_phone_number is
  'RingCentral phone number used for SMS; independent from selected_caller_id.';
