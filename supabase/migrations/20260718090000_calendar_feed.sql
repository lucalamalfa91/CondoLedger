alter table houses
  add column if not exists calendar_feed_token uuid not null default gen_random_uuid(),
  add column if not exists calendar_feed_enabled boolean not null default false,
  add column if not exists calendar_reminder_cadence text not null default 'monthly'
    check (calendar_reminder_cadence in ('monthly', 'bimonthly', 'semiannual')),
  add column if not exists calendar_reminder_lead_days integer not null default 3
    check (calendar_reminder_lead_days >= 0 and calendar_reminder_lead_days <= 30);

-- Backfill: righe esistenti create prima del default non hanno un token.
update houses set calendar_feed_token = gen_random_uuid() where calendar_feed_token is null;

create unique index if not exists idx_houses_calendar_feed_token on houses(calendar_feed_token);

comment on column houses.calendar_feed_token is
  'Token opaco per la sottoscrizione al feed ICS (webcal). Non protetto da RLS lato Edge Function: rigenerabile dal proprietario in caso di leak.';
