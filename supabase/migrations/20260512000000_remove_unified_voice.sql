-- Remove the legacy Unified Voice / SIP data model.
-- RingCentral RingOut does not need these tables.

drop table if exists public.user_sip_preferences cascade;
drop table if exists public.sip_profiles cascade;
