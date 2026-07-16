-- Collega un dovuto (rata pagabile) al saldo anno precedente a debito che rappresenta,
-- così i versamenti possono coprire il conguaglio tramite l'infrastruttura rate esistente.

alter table dues
  add column if not exists prior_balance_id bigint references prior_balances(id) on delete cascade;

-- Un solo dovuto collegato per saldo: evita doppioni in caso di doppio submit/race.
create unique index if not exists idx_dues_prior_balance_id_unique
  on dues(prior_balance_id) where prior_balance_id is not null;
