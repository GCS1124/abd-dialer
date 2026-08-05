alter table if exists public.leads
  add column if not exists website text,
  add column if not exists timezone text;

update public.leads
set
  website = coalesce(
    nullif(website, ''),
    nullif((regexp_match(coalesce(notes, ''), '(?mi)^\s*Website:\s*(.+?)\s*$'))[1], '')
  ),
  timezone = coalesce(
    nullif(timezone, ''),
    nullif((regexp_match(coalesce(notes, ''), '(?mi)^\s*Time Zone:\s*(.+?)\s*$'))[1], '')
  );

update public.leads
set notes = nullif(
  btrim(
    regexp_replace(
      regexp_replace(
        coalesce(notes, ''),
        '(^|\n)\s*Website:\s*.*?(\n|$)',
        E'\\1',
        'gmi'
      ),
      '(^|\n)\s*Time Zone:\s*.*?(\n|$)',
      E'\\1',
      'gmi'
    )
  ),
  ''
)
where coalesce(notes, '') ~* '(^|\n)\s*(Website|Time Zone):\s*';
