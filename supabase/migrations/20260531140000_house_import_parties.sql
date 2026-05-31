-- Nominativi proprietario/affittuario per match import documenti
alter table houses
  add column if not exists import_parties jsonb not null default '[]'::jsonb;

comment on column houses.import_parties is
  'Array [{ role: owner|tenant, firstName, lastName }] per filtrare righe import documento';
