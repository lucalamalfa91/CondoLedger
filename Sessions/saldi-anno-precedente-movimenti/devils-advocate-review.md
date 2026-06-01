## Devil's Advocate — Review Response

**Vote**: OBJECT

**Reasoning**: L'implementazione saldi precedenti è coerente col brief approvato, ma emergono gap di sicurezza (credenziali in URL — critico), completezza operativa (migrazione DB, listener mancante) e rischi di doppio conteggio non mitigati in UI oltre al warning testuale. Procedere solo dopo fix URL e checklist deploy.

**Details**:

### Challenge 1: Credenziali esposte nella URL
**Category**: error  
**Reference**: `?email=…&password=…#movimenti/situazione` segnalato in produzione  
**Issue**: `syncRouteHash` preservava `location.search`, mantenendo email/password visibili dopo la navigazione. Fix applicato (`url-sanitize.js`, hash routing senza query). **Azione utente**: cambiare password — è stata condivisa in chiaro (URL, chat, log server/proxy).

### Challenge 2: Migrazione Supabase non verificata in deploy
**Category**: completeness-gap  
**Reference**: `supabase/migrations/20260601120000_prior_balances.sql`  
**Issue**: Senza migrazione applicata, CRUD fallisce silenziosamente o con errore generico. Manca gate CI/deploy che verifichi schema.

### Challenge 3: Coesistenza riporti `carryFromPeriodId`
**Category**: assumption  
**Reference**: Warning soft se coesistono `prior_balances` e riporti su preventivo  
**Issue**: L'utente può ancora sommare due volte concettualmente (saldo prec. + riporto). Il warning non blocca il salvataggio.

### Challenge 4: Import documento fuori scope ma gap funzionale
**Category**: completeness-gap  
**Reference**: `document-import-map.js` crea ancora dovuto riporto  
**Issue**: Flusso principale amministratore popola `dues`, non `prior_balances` — incoerenza col nuovo modello finché non integrato.

### Challenge 5: Assenza test automatizzati
**Category**: unspecified-element  
**Reference**: `execution.md` — solo verifica manuale  
**Issue**: Regressione su auth URL, totali Situazione/PDF non coperta da test.

### Challenge 6: Listener CRUD saldi precedenti
**Category**: error  
**Reference**: `priorBalancesTable` senza `handleRecordAction`  
**Issue**: Modifica/elimina dalla lista non funzionava. **Risolto** in questo fix.

---

## Coordinator resolutions

| Challenge | Resolution |
|-----------|------------|
| 1 | Fix implementato; raccomandato reset password |
| 2 | Accettato; next step = applicare migrazione su Supabase |
| 3 | Parzialmente accettato; warning UI sufficiente fase 1 |
| 4 | Dismissed fase 1 (out of scope esplicito) |
| 5 | Accettato; checklist manuale in verification.md |
| 6 | Fix implementato |
