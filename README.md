# Gestione Spese Condominiali

Applicazione web per gestire le spese condominiali di più immobili: dovuti per esercizio
fiscale, rate, versamenti, saldi di apertura, import dell'estratto conto Banca Intesa,
rendiconto e promemoria su calendario.

## Stack

- **Frontend**: HTML/CSS/JS puro, moduli ES nativi, nessun build step
- **Backend**: Node + Express
- **Database**: SQLite (un file), via better-sqlite3
- **Autenticazione**: email e password, sessione su cookie HttpOnly

Il server espone la REST API e serve anche i file statici, quindi tutto vive su una sola
origine: niente CORS e nessun token nel browser.

## File

| Path | Descrizione |
|---|---|
| `index.html` | Entry point dell'applicazione |
| `css/app.css` | Stili |
| `js/` | Moduli ES: api, auth, dominio fiscale, rate, import Intesa, UI |
| `server/` | Express, schema SQLite, autenticazione, rotte |
| `server/schema.sql` | Schema del database, applicato all'avvio |
| `scripts/` | CLI utenti, migrazione dati, smoke test |
| `data/` | Il file `.db` (non versionato) |
| `Dockerfile`, `railway.json`, `fly.toml` | Deploy |
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
| `DB_PATH` | `./data/condoledger.db` | In produzione punta al volume persistente |
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

### Sull'host, senza aprire una shell (consigliato su Railway)

Imposta tre variabili nel pannello dell'host e fai partire un deploy:

```
MIGRATE_FROM_SUPABASE=true
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Al primo avvio il server migra da solo e scrive il diario nei log: conteggi letti contro
scritti, verifica dell'integrità referenziale, e l'elenco dei comandi `set-password` da
eseguire. Poi **rimuovi le tre variabili**.

È sicuro anche se te le dimentichi: non parte se il database contiene già delle case,
scrive dentro una transazione, e se fallisce lascia il database vuoto e il server si avvia
comunque, così puoi leggere i log.

### Da riga di comando

```bash
npm run migrate:supabase -- --dry-run     # legge e conta, non scrive
npm run migrate:supabase
```

Da eseguire **dove vive il database**: in locale se il DB è in locale, oppure dentro il
container (`railway ssh`, `fly ssh console`). Attenzione: `railway run <comando>` esegue il
comando **sul tuo computer** con le variabili remote — scriverebbe un `.db` locale che sul
volume non arriva mai.

### Dopo, in quest'ordine

1. `npm run set-password -- tua@email.it` per ogni utente: gli hash bcrypt interni a
   Supabase non sono esportabili, quindi finché non lo fai nessuno può accedere.
2. Apri **Situazione** su una casa con storico e confronta saldi e conguagli con quelli che
   vedi oggi su Supabase: la logica di calcolo non è cambiata, quindi **devono coincidere al
   centesimo**.
3. Solo a verifica passata: metti in pausa Supabase e **ruota le chiavi** — la vecchia
   `anon` key resta nella cronologia git di questo repository.

---

## Deploy

Il database è un file, quindi serve un host con **disco persistente**. Su piattaforme con
filesystem effimero (Vercel, o Railway senza volume) il file viene ricreato a ogni deploy e
**i dati si perdono**.

Il file `.db` **non va mai committato**: a ogni deploy il container riparte da un checkout
pulito del repository, quindi il database tornerebbe alla versione nel commit, perdendo
tutto ciò che è stato inserito nel frattempo. `.gitignore` lo esclude apposta.

### Railway

Un solo servizio: app e database nello stesso container, il file sul volume.

1. **New Project → Deploy from GitHub repo**, scegli questo repository. Railway rileva il
   `Dockerfile` e `railway.json`.
2. **Settings → Volumes → New Volume**, mount path `/data`. Senza questo passo l'app
   funziona ma si svuota a ogni deploy.
3. **Variables**:
   ```
   DB_PATH=/data/condoledger.db
   COOKIE_SECURE=true
   NODE_ENV=production
   ```
   `PORT` la inietta Railway da sé.
4. Migra i dati (sezione sopra) oppure, per partire da zero, crea il primo utente con
   `railway ssh` → `npm run create-user -- tua@email.it`.

**Mai più di una replica**: il volume è agganciato a una sola macchina e SQLite ammette un
solo scrittore. `railway.json` tiene `numReplicas: 1`.

### Fly.io

Configurazione equivalente in `fly.toml`, con volume su `/data`:

```bash
fly launch --no-deploy --copy-config
fly volumes create condoledger_data --size 1 --region cdg
fly deploy
fly ssh console -C "node scripts/create-user.mjs tua@email.it"
```

Vanno bene allo stesso modo Render con Persistent Disk o Docker su un VPS: il `Dockerfile`
è lo stesso.

### CI

`.github/workflows/deploy.yml` esegue i test su ogni push e pull request. Il job di deploy
è scritto per Fly (`FLY_API_TOKEN`); su Railway il deploy parte da sé a ogni push, quindi
quel job va rimosso o lasciato disabilitato.

### Backup

Il file `.db` è tutto il database.

```bash
railway ssh    # oppure: fly ssh console
sqlite3 /data/condoledger.db ".backup /data/backup.db"
```

Per qualcosa di più solido vale la pena aggiungere [Litestream](https://litestream.io/),
che replica il WAL su S3 o R2 in continuo. La funzione Backup dentro l'app
(Impostazioni → Backup) esporta un JSON ed è la seconda rete di sicurezza — nota però che
**non include i movimenti bancari**.

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
