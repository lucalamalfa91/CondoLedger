-- Sostituisce il collegamento dovuto->saldo precedente con un collegamento diretto
-- versamento->saldo precedente: un versamento può coprire (anche parzialmente, con
-- più versamenti nel tempo) un saldo anno precedente a debito, senza passare da un
-- dovuto/rata sintetico.

drop index if exists idx_dues_prior_balance_id_unique;

alter table dues
  drop column if exists prior_balance_id;

-- on delete set null (non cascade): eliminando il saldo precedente i versamenti restano,
-- semplicemente non più collegati a nessun saldo (coerente con l'orfanamento già usato
-- altrove nell'app quando si elimina un dovuto collegato a versamenti esistenti).
alter table payments
  add column if not exists prior_balance_id bigint references prior_balances(id) on delete set null;

create index if not exists idx_payments_prior_balance_id on payments(prior_balance_id);
