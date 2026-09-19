# Guida tecnica

Installazione, configurazione e deploy di Gestione Spese Condominiali.
Per capire cosa fa l'applicazione, parti dal [README](../README.md).

## Com'è fatta

- **Frontend**: HTML/CSS/JS puro, moduli ES nativi, nessun build step
- **Backend**: Node + Express, su funzioni serverless Vercel
- **Database**: Turso (SQLite gestito), via `@libsql/client`
- **Autenticazione**: email e password, sessione su cookie HttpOnly

Il server espone la REST API e serve anche i file statici, quindi tutto vive su una sola
origine: niente CORS e nessun token nel browser.

| Path | Descrizione |
|---|---|
| `index.html` | Entry point dell'applicazione |
| `css/app.css` | Stili |
| `js/` | Moduli ES: api, auth, dominio fiscale, rate, import Intesa, UI |
| `server/` | Express, schema SQLite, autenticazione, rotte |
| `server/schema.sql` | Schema del database, applicato all'avvio |
| `scripts/` | CLI utenti, migrazione dati, smoke test |
| `data/` | Il file `.db` (non versionato) |
| `api/index.js`, `vercel.json` | Entry point serverless e routing |
| `Dockerfile`, `fly.toml` | Deploy alternativo su container |
| `references/intesa-format.md` | Formato dell'export Excel di Banca Intesa |

---

## Avvio in locale

```bash
npm install
cp .env.example .env          # i default vanno bene per lo sviluppo
npm run create-user -- tua@email.it
npm start
```

Poi apri `http://localhost:3000`.

Il database viene creato al primo avvio in `./data/condoledger.db` e lo schema è applicato
automaticamente: non ci sono migration da lanciare a mano.

Per sviluppare con ricaricamento automatico del server: `npm run dev`.

### Variabili d'ambiente

Tutte hanno un default sensato; vedi `.env.example`.

| Variabile | Default | Note |
|---|---|---|
| `PORT` | `3000` | |
| `TURSO_DATABASE_URL` | — | Se impostata, il database è su Turso e non serve un disco |
| `TURSO_AUTH_TOKEN` | — | Token del database Turso |
| `DB_PATH` | `./data/condoledger.db` | File locale, usato quando `TURSO_DATABASE_URL` è vuota |
| `COOKIE_SECURE` | `false` | **`true` in produzione**: su HTTPS il cookie va marcato Secure |
| `SESSION_TTL_DAYS` | `30` | Durata della sessione, rinnovata a scorrimento |
| `NODE_ENV` | `development` | |

---

## Gestione utenti

Non esiste registrazione dall'applicazione: gli account si creano da riga di comando, sulla
macchina che ospita il database.

```bash
npm run create-user  -- tua@email.it     # nuovo utente
npm run set-password -- tua@email.it     # password dimenticata
```

`set-password` chiude tutte le sessioni aperte di quell'utente. Non c'è invio di email:
senza un servizio SMTP il recupero password passa da qui. Il cambio password dall'interno
dell'app (Impostazioni → Account) funziona normalmente.

---

## Test

```bash
npm test
```

Esegue `scripts/smoke-api.test.mjs` con il runner integrato di Node su un database
temporaneo. Copre login, isolamento fra utenti, CRUD di dovuti, versamenti e saldi, import
bancario con il collegamento fra movimento e versamento, cancellazioni a cascata e cambio
password. Non serve nessun servizio esterno.

---

## Migrazione da Supabase

Se stai arrivando dalla versione che usava Supabase, i dati si importano una volta sola.
Lo script legge l'API REST di Supabase in diretta: **non serve un backup**, e funziona anche
sul piano gratuito.

Serve la `service_role` key (Supabase → Project Settings → API), perché scavalca le policy
RLS: con la `anon` key si esporterebbero solo le righe di un utente **senza che nulla lo
segnali**. Rimuovila dall'ambiente appena finito.

### Dal tuo computer, scrivendo direttamente su Turso

È la via più semplice: lo script gira in locale, ma con `TURSO_DATABASE_URL` impostata i
dati finiscono sul database remoto. Non serve una shell sull'host.

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...        # service_role, non anon
export TURSO_DATABASE_URL=libsql://xxxx.turso.io
export TURSO_AUTH_TOKEN=...

npm run migrate:supabase -- --dry-run       # legge e conta, non scrive
npm run migrate:supabase
```

La prima riga dell'output dice dove sta scrivendo (`Turso (libsql://…)` oppure `file locale
(…)`): **leggila**. Se `TURSO_DATABASE_URL` non è arrivata all'ambiente, lo script popola un
file locale e il database di produzione resta vuoto, senza che nulla dia errore.

Alla fine lo script verifica l'integrità referenziale, confronta le righe lette con quelle
scritte e stampa i comandi `set-password` da eseguire. Cancella le variabili dall'ambiente
appena finito.

### In alternativa: dall'host, senza aprire una shell

Se preferisci non installare niente in locale, imposta tre variabili nel pannello dell'host
e fai partire un deploy:

```
MIGRATE_FROM_SUPABASE=true
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Al primo avvio il server migra da solo e scrive lo stesso diario nei log. Poi **rimuovi le
tre variabili**.

È sicuro anche se te le dimentichi: non parte se il database contiene già delle case, scrive
dentro una transazione, e se fallisce lascia il database vuoto e avvia comunque il server —
un'app che non parte affatto è più difficile da diagnosticare di un'app vuota con i log in
bella vista.

### Dopo, in quest'ordine

1. **Imposta una password**: gli hash bcrypt interni a Supabase non sono riutilizzabili,
   quindi finché non lo fai nessuno può accedere. Con le variabili `TURSO_*` ancora
   nell'ambiente:

   ```bash
   npm run set-password -- tua@email.it
   ```

   Senza una shell, l'equivalente dal pannello dell'host: aggiungi queste due variabili,
   riavvia, accedi, poi **rimuovile**.

   ```
   BOOTSTRAP_USER_EMAIL=tua@email.it
   BOOTSTRAP_USER_PASSWORD=scegline-una
   ```

   Crea l'utente se non esiste, o ne reimposta la password se la migrazione l'ha già
   portato. La password non finisce nei log.
2. Apri **Situazione** su una casa con storico e confronta saldi e conguagli con quelli che
   vedi oggi su Supabase: la logica di calcolo non è cambiata, quindi **devono coincidere al
   centesimo**.
3. Solo a verifica passata: metti in pausa Supabase e **ruota le chiavi** — la vecchia
   `anon` key resta nella cronologia git di questo repository.

---

## Deploy su Vercel + Turso

Il database vive su **Turso** (SQLite gestito), quindi all'app non serve alcun disco e può
girare su funzioni serverless. Entrambi i servizi hanno un piano gratuito.

### 1. Il database

Su [turso.tech](https://turso.tech) crea un database e prendi nota di **URL** (`libsql://…`)
e **auth token**.

Limiti del piano gratuito: 5 GB di storage, 500 milioni di righe lette e 10 milioni scritte
al mese — tre ordini di grandezza sopra l'uso di questa applicazione.

### 2. L'applicazione

Su Vercel, **Add New → Project**, scegli il repository. Non serve alcuna configurazione di
build: `vercel.json` instrada `/api/*` alla funzione e tutto il resto ai file statici,
serviti dalla CDN senza consumare invocazioni.

Variabili d'ambiente:

```
TURSO_DATABASE_URL=libsql://xxxx.turso.io
TURSO_AUTH_TOKEN=...
COOKIE_SECURE=true
NODE_ENV=production
```

### 3. Primo accesso

Aggiungi temporaneamente queste due, fai partire un deploy, accedi, poi **rimuovile**:

```
BOOTSTRAP_USER_EMAIL=tua@email.it
BOOTSTRAP_USER_PASSWORD=scegline-una
```

### Cosa cambia rispetto a un server tradizionale

Su serverless non esiste un processo che resta vivo fra una richiesta e l'altra. Due
conseguenze, entrambe già gestite nel codice:

- Il **rate limit sul login** non può stare in memoria, perché ogni richiesta può girare in
  un processo diverso: vive nella tabella `login_attempts`.
- La **pulizia delle sessioni scadute** non può essere un timer: avviene in modo pigro, su
  una piccola frazione delle richieste. Le sessioni scadute vengono comunque rifiutate al
  momento dell'uso, indipendentemente dalla pulizia.

### Alternative

Il `Dockerfile` e `fly.toml` restano validi per chi preferisce un container a lungo
termine (Fly.io, Render, Koyeb, un VPS). In quel caso `TURSO_DATABASE_URL` è facoltativa:
senza, l'app usa un file locale in `DB_PATH` e serve un disco persistente.

---

### Backup

Con il database su Turso, i backup li gestisce Turso (point-in-time restore incluso nel
piano gratuito). Per una copia locale:

```bash
turso db shell <nome-db> .dump > backup.sql
```

La funzione Backup dentro l'app (Impostazioni → Backup) esporta un JSON ed è la seconda
rete di sicurezza — nota però che **non include i movimenti bancari**.

---

## Note

- **Dipendenza da CDN**: `js/intesa.js` importa `xlsx` da esm.sh a runtime. Se quel CDN è
  irraggiungibile non si carica il grafo dei moduli e l'intera applicazione non parte, non
  solo l'import bancario. Vale la pena servire la libreria in locale.
- **Contesto sicuro**: l'import bancario usa `crypto.subtle`, disponibile solo su HTTPS o
  `localhost`. Aprendo l'app da un indirizzo IP di rete locale (`http://192.168.x.x`) quella
  funzione fallisce.
- **Import da documento**: la funzionalità di estrazione AI dal documento
  dell'amministratore è stata rimossa insieme a Supabase. I dovuti si inseriscono da
  Registra → Dovuti.
