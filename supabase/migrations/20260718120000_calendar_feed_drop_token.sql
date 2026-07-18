-- Il promemoria calendario è passato da feed sottoscrivibile (Edge Function + token)
-- a export .ics scaricato/importato manualmente: non serve più un endpoint pubblico
-- né un token per casa. Restano solo le preferenze cadenza/preavviso.
drop index if exists idx_houses_calendar_feed_token;

alter table houses
  drop column if exists calendar_feed_token,
  drop column if exists calendar_feed_enabled;
